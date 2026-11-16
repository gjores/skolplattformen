-- Endast den skyddade serverns tre smala schemaingångar. Inga tabellrättigheter.
grant execute on function public.schema_read(jsonb) to skolplattform_worker;
grant execute on function public.schema_command(jsonb) to skolplattform_worker;
grant execute on function public.schema_status(jsonb) to skolplattform_worker;
