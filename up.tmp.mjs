import { readFileSync } from "fs"; import { createClient } from "@supabase/supabase-js";
const env=Object.fromEntries(readFileSync(".env.local","utf8").split("\n").filter(l=>l.includes("=")&&!l.trim().startsWith("#")).map(l=>[l.slice(0,l.indexOf("=")).trim(),l.slice(l.indexOf("=")+1).trim()]));
const a=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const {data:u}=await a.auth.admin.listUsers({page:1,perPage:1000});
const uid=u.users.find(x=>x.email==="qa.bayar@treelogy-qa.invalid").id;
await a.from("profiles").update({role_id:process.argv[2]}).eq("id",uid);
console.log("peran akun uji →", process.argv[2]);
