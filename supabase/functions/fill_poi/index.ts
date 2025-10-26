// supabase/functions/fill_poi/index.ts
// Edge Function: สร้าง POI รอบบ้านจากพิกัดใน properties
// ข้อกำหนด: ผู้เรียกต้อง "ล็อกอิน" และ email อยู่ในตาราง admin_emails

// Deno runtime
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// ----- Config ปรับได้ -----
const DEFAULT_RADIUS_M = 2000; // รัศมีค้นหา (เมตร)
const MAX_RESULTS = 60;        // จำกัดจำนวนทั้งหมดที่บันทึก
// amenity / shop / tourism ที่นิยมใช้ในไทย
const AMENITY = [
  "school","college","university",
  "hospital","clinic","pharmacy",
  "bank","atm","police","post_office",
  "bus_station","taxi","fuel",
  "cafe","restaurant","library",
  "kindergarten"
];
const SHOP = [
  "supermarket","convenience","mall","department_store","bakery","greengrocer"
];
const TOURISM = [
  "attraction","museum","zoo","aquarium"
];
// --------------------------------

type Body = {
  property_id: string;
  radius_m?: number;
  categories?: {
    amenity?: string[];
    shop?: string[];
    tourism?: string[];
  };
};

const cors = {
  "Access-Control-Allow-Origin": "*", // หรือใส่โดเมนเว็บจริงของคุณเพื่อความปลอดภัยสูงสุด
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
};

function haversine(lat1:number, lon1:number, lat2:number, lon2:number){
  const R = 6371000; // m
  const toRad = (d:number)=> d*Math.PI/180;
  const dLat = toRad(lat2-lat1);
  const dLon = toRad(lon2-lon1);
  const a = Math.sin(dLat/2)**2 +
            Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*
            Math.sin(dLon/2)**2;
  return 2*R*Math.asin(Math.sqrt(a));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey     = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // client ที่ถือ JWT ของผู้ใช้ (เพื่อดึง user.email)
    const authed = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });

    // client สิทธิ์ service key (ใช้เขียน/อ่าน DB ตามต้องการ)
    const admin = createClient(supabaseUrl, serviceKey);

    // 1) ตรวจสิทธิ์: ต้องล็อกอิน
    const { data: auth } = await authed.auth.getUser();
    const email = auth?.user?.email ?? "";
    if (!email) {
      return new Response(JSON.stringify({ code: 401, message: "Unauthorized" }), {
        status: 401, headers: { "Content-Type": "application/json", ...cors }
      });
    }

    // 2) ตรวจว่าเป็นแอดมินจากตาราง admin_emails
    const { data: adminEmail, error: adminErr } = await admin
      .from("admin_emails")
      .select("email")
      .eq("email", email)
      .maybeSingle();
    if (adminErr) throw adminErr;
    if (!adminEmail) {
      return new Response(JSON.stringify({ code: 403, message: "Admins only" }), {
        status: 403, headers: { "Content-Type": "application/json", ...cors }
      });
    }

    // 3) รับพารามิเตอร์
    const body = (await req.json().catch(() => ({}))) as Body;
    const propertyId = body?.property_id;
    const radius = Math.min(Math.max(body?.radius_m ?? DEFAULT_RADIUS_M, 200), 8000);

    if (!propertyId) {
      return new Response(JSON.stringify({ code: 400, message: "Missing property_id" }), {
        status: 400, headers: { "Content-Type": "application/json", ...cors }
      });
    }

    // 4) โหลดพิกัดจาก properties
    const { data: prop, error: propErr } = await admin
      .from("properties")
      .select("id, latitude, longitude, title")
      .eq("id", propertyId)
      .maybeSingle();
    if (propErr) throw propErr;
    if (!prop?.latitude || !prop?.longitude) {
      return new Response(JSON.stringify({ code: 422, message: "Property has no lat/lng" }), {
        status: 422, headers: { "Content-Type": "application/json", ...cors }
      });
    }
    const { latitude: lat, longitude: lng, title } = prop;

    // 5) เตรียมหมวดหมู่ที่ต้องการค้นหา
    const amenityList = (body.categories?.amenity?.length ? body.categories.amenity : AMENITY).join("|");
    const shopList    = (body.categories?.shop?.length    ? body.categories.shop    : SHOP).join("|");
    const tourList    = (body.categories?.tourism?.length ? body.categories.tourism : TOURISM).join("|");

    // 6) ยิง Overpass API (ฟรี)
    // เลือก endpoint ใด endpoint หนึ่ง (เผื่อ mirrored)
    const overpass = "https://overpass-api.de/api/interpreter";
    const q = `
      [out:json][timeout:25];
      (
        node(around:${radius},${lat},${lng})[amenity~"${amenityList}"];
        node(around:${radius},${lat},${lng})[shop~"${shopList}"];
        node(around:${radius},${lat},${lng})[tourism~"${tourList}"];
      );
      out body;
    `.trim();

    const osmRes = await fetch(overpass, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ data: q }),
    });
    if (!osmRes.ok) {
      const t = await osmRes.text();
      throw new Error(`Overpass error: ${osmRes.status} ${t}`);
    }
    const osm = await osmRes.json();

    // 7) แปลงผลลัพธ์ → มาตรฐานของเรา
    type POI = {
      name: string;
      category: string;
      lat: number;
      lng: number;
      distance_m: number;
      ext_source: string;
      ext_id: string;
      raw?: any;
    };

    const pois: POI[] = (osm?.elements ?? [])
      .filter((e: any) => e?.lat && e?.lon)
      .map((e: any) => {
        const name =
          e?.tags?.name ??
          e?.tags?.["name:th"] ??
          e?.tags?.["brand"] ?? "ไม่ทราบชื่อ";
        const category =
          e?.tags?.amenity ??
          e?.tags?.shop ??
          e?.tags?.tourism ??
          "poi";
        const pLat = Number(e.lat);
        const pLng = Number(e.lon);
        const distance = Math.round(haversine(lat, lng, pLat, pLng));
        return {
          name,
          category,
          lat: pLat,
          lng: pLng,
          distance_m: distance,
          ext_source: "osm",
          ext_id: `${e.type}:${e.id}`,
          raw: { tags: e.tags ?? {} }
        } as POI;
      })
      // กรองของที่ไม่มีชื่อออก เพื่อ UX สวยขึ้น
      .filter(p => p.name && p.name !== "ไม่ทราบชื่อ")
      // เรียงตามใกล้สุด
      .sort((a,b) => a.distance_m - b.distance_m)
      // จำกัดจำนวน
      .slice(0, MAX_RESULTS);

    // 8) ลบข้อมูลเดิมของ property_id เพื่อป้องกันซ้ำ
    const { error: delErr } = await admin
      .from("property_poi")
      .delete()
      .eq("property_id", propertyId);
    if (delErr) throw delErr;

    // 9) บันทึกใหม่แบบ bulk
    if (pois.length) {
      const rows = pois.map(p => ({
        property_id: propertyId,
        name: p.name,
        category: p.category,
        latitude: p.lat,
        longitude: p.lng,
        distance_m: p.distance_m,
        ext_source: p.ext_source,
        ext_id: p.ext_id,
        extra: p.raw ?? null
      }));
      const { error: insErr } = await admin.from("property_poi").insert(rows);
      if (insErr) throw insErr;
    }

    // 10) ตอบกลับ
    return new Response(JSON.stringify({
      ok: true,
      property_id: propertyId,
      property_title: title,
      lat, lng, radius_m: radius,
      inserted: pois.length
    }), { headers: { "Content-Type": "application/json", ...cors } });

  } catch (err: any) {
    console.error("fill_poi error:", err);
    return new Response(JSON.stringify({ ok: false, error: String(err?.message ?? err) }), {
      status: 500, headers: { "Content-Type": "application/json", ...cors }
    });
  }
});
