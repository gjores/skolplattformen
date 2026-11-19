-- Den skyddade webbserverns två ingångar till skolans provunderlag.
grant execute on function public.nationella_prov_read(jsonb) to skolplattform_worker;
grant execute on function public.nationella_prov_save(jsonb) to skolplattform_worker;
