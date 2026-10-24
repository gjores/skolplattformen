-- 05.1-20: only the audited, session- and school-scoped year read entrypoint.
-- Existing command/read/status grants and all table/helper ACLs remain unchanged.
grant execute on function public.tjanst_year_preview(jsonb) to skolplattform_worker;
