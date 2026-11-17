-- Endast den skyddade serverns två smala ingångar till skolans salregister (05.2-SM-UXF-23). Inga tabellrättigheter.
grant execute on function public.school_rooms_read(jsonb) to skolplattform_worker;
grant execute on function public.school_rooms_save(jsonb) to skolplattform_worker;
