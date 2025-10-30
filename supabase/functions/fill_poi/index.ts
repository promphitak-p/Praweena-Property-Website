// supabase/functions/fill_poi/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

/* ---------------- Config ---------------- */
const DEFAULT_RADIUS_M = 2000;
const MAX_RESULTS = 60;
const AMENITY = [
  "school","college","university",
  "hospital","clinic","pharmacy",
  "bank","atm","police","post_office",
  "bus_station","taxi","fuel",
  "cafe","restaurant","library","kindergarten"
];
const SHOP = [
  "supermarket","convenience","mall",
  "department_store","bakery","greengrocer"
];
const TOURISM = ["attraction","museum","zoo","aquarium"];

/* ---------------- CORS ---------------- */
const ALLOWED_ORIGINS = [
  "https://praweena-property-website.vercel.app",
  "http://localhost:3000"
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
function haversine(lat1:number, lon1:number, lat2:number, lon2:number){
  const R = 6371000;
  const toRad = (d:number)=> d*Math.PI/180;
  const dLat = toRad(lat2-lat1);
  const dLon = toRad(lon2-lon1);
  const a = Math.sin(dLat/2)**2
    + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
  return 2*R*Math.asin(Math.sqrt(a));
}

// ดึงจาก Overpass แล้วคืนเป็น array
async function fetchOSMPOI(lat:number, lng:number, radius:number, categories?:{
  amenity?: string[];
  shop?: string[];
  tourism?: string[];
}) {
  const amenityList = (categories?.amenity?.length ? categories.amenity : AMENITY).join("|");
  const shopList    = (categories?.shop?.length    ? categories.shop    : SHOP).join("|");
  const tourList    = (categories?.tourism?.length ? categories.tourism : TOURISM).join("|");

  const overpass = "https://overpass-api.de/api/interpreter";
  const query = `
    [out:json][timeout:25];
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
    .filter((e:any) => e?.lat && e?.lon)
    .map((e:any) => {
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
    // ตัดอันที่ไม่มีชื่อออก
    .filter((p:any) => p.name && p.name !== "ไม่ทราบชื่อ")
    // เรียงใกล้ → ไกล
    .sort((a:any,b:any) => a.distance_m - b.distance_m)
    .slice(0, MAX_RESULTS);

  return pois;
}

/* ---------------- Handler ---------------- */
Deno.serve(async (req) => {
  const headers = corsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers });

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
      property_id: string;
      radius_m?: number;
      categories?: { amenity?: string[]; shop?: string[]; tourism?: string[] };
    };

    const body = (await req.json().catch(() => ({}))) as PreviewBody & SaveBody;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey     = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    /* ---------- กรณี PREVIEW (หน้า dashboard เรียก) ---------- */
    if (body.preview === true) {
      const lat = Number(body.lat);
      const lng = Number(body.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        return new Response(JSON.stringify({ ok:false, message: "Missing lat/lng" }), {
          status: 400, headers: { ...headers, "Content-Type": "application/json" },
        });
      }

      const radius = Math.min(Math.max(body.radius_m ?? DEFAULT_RADIUS_M, 200), 8000);
      const pois = await fetchOSMPOI(lat, lng, radius, body.categories);

      const limit = body.limit && body.limit > 0 ? body.limit : 5;
      const top = pois.slice(0, limit).map(p => ({
        name: p.name,
        type: p.type,
        lat: p.lat,
        lng: p.lng,
        distance_km: Number((p.distance_m / 1000).toFixed(3)),
      }));

      return new Response(JSON.stringify({
        ok: true,
        mode: "preview",
        lat, lng,
        items: top,
      }), { headers: { ...headers, "Content-Type": "application/json" } });
    }

    /* ---------- กรณี SAVE (ของเดิมกุ้ง) ---------- */
    const authed = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const admin = createClient(supabaseUrl, serviceKey);

    // 1) auth
    const { data: auth } = await authed.auth.getUser();
    const email = auth?.user?.email ?? "";
    if (!email) {
      return new Response(JSON.stringify({ code: 401, message: "Unauthorized" }), {
        status: 401, headers: { ...headers, "Content-Type": "application/json" },
      });
    }

    // 2) admin only
    const { data: adminEmail, error: adminErr } = await admin
      .from("admin_emails").select("email").eq("email", email).maybeSingle();
    if (adminErr) throw adminErr;
    if (!adminEmail) {
      return new Response(JSON.stringify({ code: 403, message: "Admins only" }), {
        status: 403, headers: { ...headers, "Content-Type": "application/json" },
      });
    }

    // 3) ต้องมี property_id
    const propertyId = body.property_id;
    if (!propertyId) {
      return new Response(JSON.stringify({ code: 400, message: "Missing property_id" }), {
        status: 400, headers: { ...headers, "Content-Type": "application/json" },
      });
    }

    // 4) ดึง property
    const { data: prop, error: propErr } = await admin
      .from("properties")
      .select("id, latitude, longitude, title")
      .eq("id", propertyId)
      .maybeSingle();
    if (propErr) throw propErr;
    if (!prop?.latitude || !prop?.longitude) {
      return new Response(JSON.stringify({ code: 422, message: "Property has no lat/lng" }), {
        status: 422, headers: { ...headers, "Content-Type": "application/json" },
      });
    }
    const { latitude: lat, longitude: lng, title } = prop;

    const radius = Math.min(Math.max(body?.radius_m ?? DEFAULT_RADIUS_M, 200), 8000);

    // 5) ดึง OSM
    const pois = await fetchOSMPOI(lat, lng, radius, body.categories);

    // 6) ลบของเก่าก่อน
    const { error: delErr } = await admin.from("property_poi").delete().eq("property_id", propertyId);
    if (delErr) throw delErr;

    // 7) insert ใหม่
    if (pois.length) {
      const rows = pois.map(p => ({
        property_id: propertyId,
        name: p.name,
        type: p.type,
        lat: p.lat,
        lng: p.lng,
        distance_km: Number((p.distance_m / 1000).toFixed(3)),
        ext_source: p.ext_source,
        ext_id: p.ext_id,
        extra: p.raw ?? null,
      }));
      const { error: insErr } = await admin.from("property_poi").insert(rows);
      if (insErr) throw insErr;
    }

    // 8) ส่งกลับ 5 รายการให้ UI
    const top5 = pois.slice(0, 5).map(p => ({
      name: p.name,
      type: p.type,
      lat: p.lat,
      lng: p.lng,
      distance_km: Number((p.distance_m / 1000).toFixed(3)),
    }));

    return new Response(JSON.stringify({
      ok: true,
      mode: "save",
      property_id: propertyId,
      property_title: title,
      lat, lng, radius_m: radius,
      inserted: pois.length,
      items: top5,
    }), { headers: { ...headers, "Content-Type": "application/json" } });

  } catch (err:any) {
    console.error("fill_poi error:", err);
    return new Response(JSON.stringify({ ok:false, error:String(err?.message ?? err) }), {
      status: 500, headers: { ...headers, "Content-Type": "application/json" },
    });
  }
});
