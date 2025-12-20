// supabase/functions/fill_poi/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

/* ---------------- Config ---------------- */

// ดีฟอลต์ 2 กม. (เวลา dashboard เรียกแบบ preview ถ้าไม่ได้ส่งมา)
const DEFAULT_RADIUS_M = 2000;

// เราจะดึงจาก OSM ได้สูงสุดเท่านี้ก่อนจะไปเติมของเราเอง
const MAX_RESULTS = 60;

// ตัวกรองหลัก ๆ
const AMENITY = [
  "school", "college", "university",
  "hospital", "clinic", "pharmacy",
  "bank", "atm", "police", "post_office",
  "bus_station", "taxi", "fuel",
  "cafe", "restaurant", "library", "kindergarten"
];
const SHOP = [
  "supermarket", "convenience", "mall",
  "department_store", "bakery", "greengrocer"
];
const TOURISM = ["attraction", "museum", "zoo", "aquarium"];

/* ---------------- CORS ---------------- */
const ALLOWED_ORIGINS = [
  "https://praweena-property-website.vercel.app",
  "http://localhost:3000",
];
function corsHeaders(req: Request) {
  const origin = req.headers.get("origin") ?? "";
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Vary": "Origin",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-api-version",
  };
}

/* ---------------- Utils ---------------- */
function haversine(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371000;
  const toRad = (d: number) => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/* ---------------- Our Fallbacks (ของเราเอง) ---------------- */

// กรณีส่วนใหญ่กุ้งทำในตัวเมืองสุราษฯ
function getPraweenaSuratFallback(lat: number, lng: number) {
  return [
    {
      name: "โรงพยาบาลสุราษฎร์ธานี",
      type: "hospital",
      lat: 9.13045,
      lng: 99.3299,
    },
    {
      name: "เทศบาลนครสุราษฎร์ธานี",
      type: "government",
      lat: 9.1422,
      lng: 99.3273,
    },
    {
      name: "โรงเรียนสุราษฎร์พิทยา",
      type: "school",
      lat: 9.1392,
      lng: 99.3297,
    },
    {
      name: "Central Suratthani",
      type: "supermarket",
      lat: 9.1136,
      lng: 99.3291,
    },
    {
      name: "Big C สุราษฎร์ธานี",
      type: "supermarket",
      lat: 9.1088,
      lng: 99.3296,
    },
    {
      name: "ตลาดศาลเจ้า",
      type: "market",
      lat: 9.1377,
      lng: 99.3279,
    },
    {
      name: "ตลาดสดเทศบาล",
      type: "market",
      lat: 9.1407,
      lng: 99.3274,
    },
  ].map((p) => {
    const d = haversine(lat, lng, p.lat, p.lng) / 1000;
    return { ...p, distance_km: Number(d.toFixed(3)), ext_source: "fallback" };
  });
}

// ถ้ามีบ้านที่สมุยบ่อย ๆ ก็แยกเลย
function getSamuiFallback(lat: number, lng: number) {
  return [
    {
      name: "โรงพยาบาลเกาะสมุย",
      type: "hospital",
      lat: 9.5357,
      lng: 99.935,
    },
    {
      name: "ท่าเรือหน้าทอน",
      type: "harbour",
      lat: 9.5343,
      lng: 99.9358,
    },
    {
      name: "โรงเรียนเกาะสมุย",
      type: "school",
      lat: 9.5374,
      lng: 99.9385,
    },
    {
      name: "เซ็นทรัล สมุย",
      type: "supermarket",
      lat: 9.5357,
      lng: 99.9359,
    },
  ].map((p) => {
    const d = haversine(lat, lng, p.lat, p.lng) / 1000;
    return { ...p, distance_km: Number(d.toFixed(3)), ext_source: "fallback" };
  });
}

// เลือก fallback ตามจังหวัด ถ้ายังไม่รู้จังหวัด ก็ใช้สุราษฯ ไปก่อน
function getPraweenaFallbackByProvince(province: string | null, lat: number, lng: number) {
  const pv = (province || "").trim();
  if (pv.includes("สมุย")) return getSamuiFallback(lat, lng);
  return getPraweenaSuratFallback(lat, lng);
}

/* ---------------- OSM fetch ---------------- */
async function fetchOSMPOI(
  lat: number,
  lng: number,
  radius: number,
  categories?: {
    amenity?: string[];
    shop?: string[];
    tourism?: string[];
  },
) {
  const amenityList = (categories?.amenity?.length ? categories.amenity : AMENITY).join("|");
  const shopList = (categories?.shop?.length ? categories.shop : SHOP).join("|");
  const tourList = (categories?.tourism?.length ? categories.tourism : TOURISM).join("|");

  const overpass = "https://overpass-api.de/api/interpreter";
  const query = `
    [out:json][timeout:5];
    (
      node(around:${radius},${lat},${lng})[amenity~"${amenityList}"];
      node(around:${radius},${lat},${lng})[shop~"${shopList}"];
      node(around:${radius},${lat},${lng})[tourism~"${tourList}"];
    );
    out body;
  `;

  const osmRes = await fetch(overpass, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ data: query }),
  });

  if (!osmRes.ok) {
    const txt = await osmRes.text().catch(() => "");
    throw new Error(`Overpass error: ${txt}`);
  }

  const osm = await osmRes.json();

  const pois = (osm?.elements ?? [])
    .filter((e: any) => e?.lat && e?.lon)
    .map((e: any) => {
      const name = e?.tags?.name ?? e?.tags?.["name:th"] ?? e?.tags?.brand ?? "ไม่ทราบชื่อ";
      const type = e?.tags?.amenity ?? e?.tags?.shop ?? e?.tags?.tourism ?? "poi";
      const pLat = Number(e.lat);
      const pLng = Number(e.lon);
      const distance_m = Math.round(haversine(lat, lng, pLat, pLng));
      return {
        name,
        type,
        lat: pLat,
        lng: pLng,
        distance_m,
        ext_source: "osm",
        ext_id: `${e.type}:${e.id}`,
        raw: { tags: e.tags ?? {} },
      };
    })
    .filter((p: any) => p.name && p.name !== "ไม่ทราบชื่อ")
    .sort((a: any, b: any) => a.distance_m - b.distance_m)
    .slice(0, MAX_RESULTS);

  return pois;
}

/* ---------------- Handler ---------------- */
Deno.serve(async (req) => {
  const headers = corsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers });
  }

  try {
    type PreviewBody = {
      preview?: boolean;
      lat?: number;
      lng?: number;
      limit?: number;
      radius_m?: number;
      categories?: { amenity?: string[]; shop?: string[]; tourism?: string[] };
    };

    type SaveBody = {
      property_id?: string;
      radius_m?: number;
      categories?: { amenity?: string[]; shop?: string[]; tourism?: string[] };
    };

    const body = (await req.json().catch(() => ({}))) as PreviewBody & SaveBody;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    /* ========== PREVIEW MODE (dashboard เรียก) ========== */
    if (body.preview === true) {
      const lat = Number(body.lat);
      const lng = Number(body.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        return new Response(JSON.stringify({ ok: false, message: "Missing lat/lng" }), {
          status: 400,
          headers: { ...headers, "Content-Type": "application/json" },
        });
      }

      // ให้กุ้งส่ง 10 กม. ก็ได้ เรา cap สูงสุดไว้ 10 กม.
      const maxRadius = 10000; // 10 km
      const radius = Math.min(
        Math.max(body.radius_m ?? DEFAULT_RADIUS_M, 200),
        maxRadius,
      );

      // 1) ลองดึงจาก OSM ก่อน
      const poisFromOSM = await fetchOSMPOI(lat, lng, radius, body.categories);

      // 2) ถ้า OSM น้อย → เติมของเรา
      let merged: any[] = poisFromOSM;
      if (!poisFromOSM || poisFromOSM.length < 15) {
        // ใช้ fallback สุราษฯ เป็นดีฟอลต์ (เพราะ preview ไม่รู้จังหวัด)
        const fb = getPraweenaSuratFallback(lat, lng);

        const used = new Set<string>();
        const makeKey = (p: any) =>
          (p.name || "").toLowerCase() +
          "|" +
          (p.lat?.toFixed(5) || "") +
          "|" +
          (p.lng?.toFixed(5) || "");

        merged = [];
        for (const p of poisFromOSM) {
          const k = makeKey(p);
          if (!used.has(k)) {
            used.add(k);
            merged.push({
              name: p.name,
              type: p.type,
              lat: p.lat,
              lng: p.lng,
              distance_km: Number((p.distance_m / 1000).toFixed(3)),
            });
          }
        }
        for (const p of fb) {
          const k = makeKey(p);
          if (!used.has(k)) {
            used.add(k);
            merged.push(p);
          }
        }
      }

      // 3) ถ้ายังไม่ถึง 25 ให้เติม generic ใกล้ ๆ บ้าน
      if (merged.length < 25) {
        const generic = [
          { name: "7-Eleven (ใกล้บ้าน)", type: "convenience", lat: lat, lng: lng + 0.0005 },
          { name: "ตลาดสดใกล้บ้าน", type: "market", lat: lat - 0.0006, lng },
          { name: "โรงพยาบาลใกล้บ้าน", type: "hospital", lat: lat + 0.001, lng: lng + 0.0003 },
        ].map((p) => {
          const d = haversine(lat, lng, p.lat, p.lng) / 1000;
          return { ...p, distance_km: Number(d.toFixed(3)), ext_source: "generic" };
        });

        const used = new Set(merged.map((p: any) => p.name));
        for (const p of generic) {
          if (!used.has(p.name)) merged.push(p);
        }
      }

      // 4) จำกัดตามที่ dashboard ขอ (กุ้งส่งมาว่า 60 ก็เอา 60)
      const limit = body.limit && body.limit > 0 ? body.limit : 5;
      const top = merged
        .sort((a: any, b: any) => (a.distance_km ?? 999) - (b.distance_km ?? 999))
        .slice(0, limit);

      return new Response(
        JSON.stringify({
          ok: true,
          mode: "preview",
          lat,
          lng,
          items: top,
        }),
        { headers: { ...headers, "Content-Type": "application/json" } },
      );
    }

    /* ========== SAVE MODE (admin call จริง ๆ) ========== */

    // client ปกติ
    const authed = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    // service
    const admin = createClient(supabaseUrl, serviceKey);

    // 1) auth
    const { data: auth } = await authed.auth.getUser();
    const email = auth?.user?.email ?? "";
    if (!email) {
      return new Response(JSON.stringify({ code: 401, message: "Unauthorized" }), {
        status: 401,
        headers: { ...headers, "Content-Type": "application/json" },
      });
    }

    // 2) admin only
    const { data: adminEmail, error: adminErr } = await admin
      .from("admin_emails")
      .select("email")
      .eq("email", email)
      .maybeSingle();
    if (adminErr) throw adminErr;
    if (!adminEmail) {
      return new Response(JSON.stringify({ code: 403, message: "Admins only" }), {
        status: 403,
        headers: { ...headers, "Content-Type": "application/json" },
      });
    }

    // 3) ต้องมี property_id
    const propertyId = body.property_id;
    if (!propertyId) {
      return new Response(JSON.stringify({ code: 400, message: "Missing property_id" }), {
        status: 400,
        headers: { ...headers, "Content-Type": "application/json" },
      });
    }

    // 4) ดึง property (เพิ่ม province มาด้วย)
    const { data: prop, error: propErr } = await admin
      .from("properties")
      .select("id, latitude, longitude, title, province")
      .eq("id", propertyId)
      .maybeSingle();
    if (propErr) throw propErr;
    if (!prop?.latitude || !prop?.longitude) {
      return new Response(JSON.stringify({ code: 422, message: "Property has no lat/lng" }), {
        status: 422,
        headers: { ...headers, "Content-Type": "application/json" },
      });
    }

    const { latitude: lat, longitude: lng, title, province } = prop;

    // radius save mode ให้สูงสุด 10 กม. เหมือนกัน
    const maxRadius = 10000;
    const radius = Math.min(Math.max(body?.radius_m ?? DEFAULT_RADIUS_M, 200), maxRadius);

    // 5) ดึงจาก OSM
    const poisFromOSM = await fetchOSMPOI(lat, lng, radius, body.categories);

    // 6) ผสานกับ fallback ตามจังหวัด
    let merged: any[] = poisFromOSM;
    if (!poisFromOSM || poisFromOSM.length < 15) {
      const fb = getPraweenaFallbackByProvince(province, lat, lng);

      const used = new Set<string>();
      const makeKey = (p: any) =>
        (p.name || "").toLowerCase() +
        "|" +
        (p.lat?.toFixed(5) || "") +
        "|" +
        (p.lng?.toFixed(5) || "");

      merged = [];
      for (const p of poisFromOSM) {
        const k = makeKey(p);
        if (!used.has(k)) {
          used.add(k);
          merged.push({
            name: p.name,
            type: p.type,
            lat: p.lat,
            lng: p.lng,
            distance_km: Number((p.distance_m / 1000).toFixed(3)),
          });
        }
      }
      for (const p of fb) {
        const k = makeKey(p);
        if (!used.has(k)) {
          used.add(k);
          merged.push(p);
        }
      }
    }

    // 7) ลบของเก่าก่อน
    const { error: delErr } = await admin.from("property_poi").delete().eq("property_id", propertyId);
    if (delErr) throw delErr;

    // 8) insert ใหม่ทั้งหมด
    if (merged.length) {
      const rows = merged.map((p: any) => ({
        property_id: propertyId,
        name: p.name,
        type: p.type,
        lat: p.lat,
        lng: p.lng,
        distance_km: p.distance_km ?? null,
        ext_source: p.ext_source ?? null,
        ext_id: p.ext_id ?? null,
        extra: p.raw ?? null,
      }));
      const { error: insErr } = await admin.from("property_poi").insert(rows);
      if (insErr) throw insErr;
    }

    // 9) ส่งกลับ 5 รายการให้ UI
    const top5 = merged
      .sort((a: any, b: any) => (a.distance_km ?? 999) - (b.distance_km ?? 999))
      .slice(0, 5)
      .map((p: any) => ({
        name: p.name,
        type: p.type,
        lat: p.lat,
        lng: p.lng,
        distance_km: p.distance_km ?? null,
      }));

    return new Response(
      JSON.stringify({
        ok: true,
        mode: "save",
        property_id: propertyId,
        property_title: title,
        lat,
        lng,
        radius_m: radius,
        inserted: merged.length,
        items: top5,
      }),
      { headers: { ...headers, "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    console.error("fill_poi error:", err);
    return new Response(JSON.stringify({ ok: false, error: String(err?.message ?? err) }), {
      status: 500,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  }
});
