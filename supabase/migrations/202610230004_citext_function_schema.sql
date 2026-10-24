-- Manual installations may install citext in public instead of extensions.
-- Resolve its actual schema without moving the extension or altering data.
do $$
declare
  v_schema text;
  v_signature text;
  v_definition text;
begin
  select n.nspname into strict v_schema
  from pg_extension e join pg_namespace n on n.oid = e.extnamespace
  where e.extname = 'citext';
  foreach v_signature in array array[
    'public.public_get_menu(text,text)',
    'public.create_public_order_internal(text,text,jsonb,text,uuid,text,text)'
  ] loop
    v_definition := pg_get_functiondef(v_signature::regprocedure);
    if position('extensions.citext' in v_definition) > 0 then
      execute replace(v_definition, 'extensions.citext', format('%I.citext', v_schema));
    end if;
  end loop;
end $$;
notify pgrst, 'reload schema';
