// Prints the number of images still awaiting an embedding, as a bare number so
// shell callers can test it. Optional argv[2] narrows to one source.
//
//   npm run pending            -- everything
//   npm run pending -- artic   -- just the Art Institute of Chicago
import { createClient } from "@supabase/supabase-js";
import { loadDotEnvLocal } from "./env";

loadDotEnvLocal();

async function main() {
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
  let query = supabase
    .from("images")
    .select("*", { count: "exact", head: true })
    .is("embedding", null)
    .is("embedding_error", null);
  const source = process.argv[2];
  if (source) query = query.eq("source_museum", source);
  const { count, error } = await query;
  if (error) {
    console.error(error.message);
    process.exit(1);
  }
  console.log(count ?? 0);
}

main();
