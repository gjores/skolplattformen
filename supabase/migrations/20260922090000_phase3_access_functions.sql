-- Enumvärden måste commit:as före användning i efterföljande migration.
alter type public.access_function add value 'elevhalsa';
alter type public.access_function add value 'elevhalsoansvarig';
alter type public.access_function add value 'it';
alter type public.access_function add value 'support';
