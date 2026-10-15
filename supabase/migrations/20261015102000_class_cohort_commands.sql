-- Early class organisation. No existing class, membership or plan is rewritten.
create table public.class_cohort_commands (
 command_id uuid primary key, actor_identity_id uuid not null references public.identities(id),
 assignment_id uuid not null references public.access_assignments(id),
 request jsonb not null, reply jsonb not null, created_at timestamptz not null default now()
);
alter table public.class_cohort_commands enable row level security;
alter table public.class_cohort_commands force row level security;
revoke all on public.class_cohort_commands from public,anon,authenticated,service_role,skolplattform_worker;
create trigger class_cohort_commands_immutable before update or delete on public.class_cohort_commands for each row execute function public.phase5_class_receipt_guard();
create trigger class_cohort_commands_no_truncate before truncate on public.class_cohort_commands for each statement execute function public.phase5_class_receipt_guard();

-- Canonical ECMAScript names, without normalization. Generated from Node Unicode 17.0:
-- forbidden codepoints are Cc/Cf or change under String.toUpperCase(). Numeric
-- ranges avoid PostgreSQL locale/simple-case differences (including sharp s).
create function public.phase5_class_cohort_name(n text) returns boolean
language plpgsql immutable set search_path=pg_catalog,public as $$
declare c text;cp integer;units integer:=0;bad constant int4multirange:='{[1,32),[97,123),[127,160),[173,174),[181,182),[223,247),[248,256),[257,258),[259,260),[261,262),[263,264),[265,266),[267,268),[269,270),[271,272),[273,274),[275,276),[277,278),[279,280),[281,282),[283,284),[285,286),[287,288),[289,290),[291,292),[293,294),[295,296),[297,298),[299,300),[301,302),[303,304),[305,306),[307,308),[309,310),[311,312),[314,315),[316,317),[318,319),[320,321),[322,323),[324,325),[326,327),[328,330),[331,332),[333,334),[335,336),[337,338),[339,340),[341,342),[343,344),[345,346),[347,348),[349,350),[351,352),[353,354),[355,356),[357,358),[359,360),[361,362),[363,364),[365,366),[367,368),[369,370),[371,372),[373,374),[375,376),[378,379),[380,381),[382,385),[387,388),[389,390),[392,393),[396,397),[402,403),[405,406),[409,412),[414,415),[417,418),[419,420),[421,422),[424,425),[429,430),[432,433),[436,437),[438,439),[441,442),[445,446),[447,448),[453,455),[456,458),[459,461),[462,463),[464,465),[466,467),[468,469),[470,471),[472,473),[474,475),[476,478),[479,480),[481,482),[483,484),[485,486),[487,488),[489,490),[491,492),[493,494),[495,497),[498,500),[501,502),[505,506),[507,508),[509,510),[511,512),[513,514),[515,516),[517,518),[519,520),[521,522),[523,524),[525,526),[527,528),[529,530),[531,532),[533,534),[535,536),[537,538),[539,540),[541,542),[543,544),[547,548),[549,550),[551,552),[553,554),[555,556),[557,558),[559,560),[561,562),[563,564),[572,573),[575,577),[578,579),[583,584),[585,586),[587,588),[589,590),[591,597),[598,600),[601,602),[603,605),[608,610),[611,615),[616,621),[623,624),[625,627),[629,630),[637,638),[640,641),[642,644),[647,653),[658,659),[669,671),[837,838),[881,882),[883,884),[887,888),[891,894),[912,913),[940,975),[976,978),[981,984),[985,986),[987,988),[989,990),[991,992),[993,994),[995,996),[997,998),[999,1000),[1001,1002),[1003,1004),[1005,1006),[1007,1012),[1013,1014),[1016,1017),[1019,1020),[1072,1120),[1121,1122),[1123,1124),[1125,1126),[1127,1128),[1129,1130),[1131,1132),[1133,1134),[1135,1136),[1137,1138),[1139,1140),[1141,1142),[1143,1144),[1145,1146),[1147,1148),[1149,1150),[1151,1152),[1153,1154),[1163,1164),[1165,1166),[1167,1168),[1169,1170),[1171,1172),[1173,1174),[1175,1176),[1177,1178),[1179,1180),[1181,1182),[1183,1184),[1185,1186),[1187,1188),[1189,1190),[1191,1192),[1193,1194),[1195,1196),[1197,1198),[1199,1200),[1201,1202),[1203,1204),[1205,1206),[1207,1208),[1209,1210),[1211,1212),[1213,1214),[1215,1216),[1218,1219),[1220,1221),[1222,1223),[1224,1225),[1226,1227),[1228,1229),[1230,1232),[1233,1234),[1235,1236),[1237,1238),[1239,1240),[1241,1242),[1243,1244),[1245,1246),[1247,1248),[1249,1250),[1251,1252),[1253,1254),[1255,1256),[1257,1258),[1259,1260),[1261,1262),[1263,1264),[1265,1266),[1267,1268),[1269,1270),[1271,1272),[1273,1274),[1275,1276),[1277,1278),[1279,1280),[1281,1282),[1283,1284),[1285,1286),[1287,1288),[1289,1290),[1291,1292),[1293,1294),[1295,1296),[1297,1298),[1299,1300),[1301,1302),[1303,1304),[1305,1306),[1307,1308),[1309,1310),[1311,1312),[1313,1314),[1315,1316),[1317,1318),[1319,1320),[1321,1322),[1323,1324),[1325,1326),[1327,1328),[1377,1416),[1536,1542),[1564,1565),[1757,1758),[1807,1808),[2192,2194),[2274,2275),[4304,4347),[4349,4352),[5112,5118),[6158,6159),[7296,7305),[7306,7307),[7545,7546),[7549,7550),[7566,7567),[7681,7682),[7683,7684),[7685,7686),[7687,7688),[7689,7690),[7691,7692),[7693,7694),[7695,7696),[7697,7698),[7699,7700),[7701,7702),[7703,7704),[7705,7706),[7707,7708),[7709,7710),[7711,7712),[7713,7714),[7715,7716),[7717,7718),[7719,7720),[7721,7722),[7723,7724),[7725,7726),[7727,7728),[7729,7730),[7731,7732),[7733,7734),[7735,7736),[7737,7738),[7739,7740),[7741,7742),[7743,7744),[7745,7746),[7747,7748),[7749,7750),[7751,7752),[7753,7754),[7755,7756),[7757,7758),[7759,7760),[7761,7762),[7763,7764),[7765,7766),[7767,7768),[7769,7770),[7771,7772),[7773,7774),[7775,7776),[7777,7778),[7779,7780),[7781,7782),[7783,7784),[7785,7786),[7787,7788),[7789,7790),[7791,7792),[7793,7794),[7795,7796),[7797,7798),[7799,7800),[7801,7802),[7803,7804),[7805,7806),[7807,7808),[7809,7810),[7811,7812),[7813,7814),[7815,7816),[7817,7818),[7819,7820),[7821,7822),[7823,7824),[7825,7826),[7827,7828),[7829,7836),[7841,7842),[7843,7844),[7845,7846),[7847,7848),[7849,7850),[7851,7852),[7853,7854),[7855,7856),[7857,7858),[7859,7860),[7861,7862),[7863,7864),[7865,7866),[7867,7868),[7869,7870),[7871,7872),[7873,7874),[7875,7876),[7877,7878),[7879,7880),[7881,7882),[7883,7884),[7885,7886),[7887,7888),[7889,7890),[7891,7892),[7893,7894),[7895,7896),[7897,7898),[7899,7900),[7901,7902),[7903,7904),[7905,7906),[7907,7908),[7909,7910),[7911,7912),[7913,7914),[7915,7916),[7917,7918),[7919,7920),[7921,7922),[7923,7924),[7925,7926),[7927,7928),[7929,7930),[7931,7932),[7933,7934),[7935,7944),[7952,7958),[7968,7976),[7984,7992),[8000,8006),[8016,8024),[8032,8040),[8048,8062),[8064,8117),[8118,8120),[8124,8125),[8126,8127),[8130,8133),[8134,8136),[8140,8141),[8144,8148),[8150,8152),[8160,8168),[8178,8181),[8182,8184),[8188,8189),[8203,8208),[8234,8239),[8288,8293),[8294,8304),[8526,8527),[8560,8576),[8580,8581),[9424,9450),[11312,11360),[11361,11362),[11365,11367),[11368,11369),[11370,11371),[11372,11373),[11379,11380),[11382,11383),[11393,11394),[11395,11396),[11397,11398),[11399,11400),[11401,11402),[11403,11404),[11405,11406),[11407,11408),[11409,11410),[11411,11412),[11413,11414),[11415,11416),[11417,11418),[11419,11420),[11421,11422),[11423,11424),[11425,11426),[11427,11428),[11429,11430),[11431,11432),[11433,11434),[11435,11436),[11437,11438),[11439,11440),[11441,11442),[11443,11444),[11445,11446),[11447,11448),[11449,11450),[11451,11452),[11453,11454),[11455,11456),[11457,11458),[11459,11460),[11461,11462),[11463,11464),[11465,11466),[11467,11468),[11469,11470),[11471,11472),[11473,11474),[11475,11476),[11477,11478),[11479,11480),[11481,11482),[11483,11484),[11485,11486),[11487,11488),[11489,11490),[11491,11492),[11500,11501),[11502,11503),[11507,11508),[11520,11558),[11559,11560),[11565,11566),[42561,42562),[42563,42564),[42565,42566),[42567,42568),[42569,42570),[42571,42572),[42573,42574),[42575,42576),[42577,42578),[42579,42580),[42581,42582),[42583,42584),[42585,42586),[42587,42588),[42589,42590),[42591,42592),[42593,42594),[42595,42596),[42597,42598),[42599,42600),[42601,42602),[42603,42604),[42605,42606),[42625,42626),[42627,42628),[42629,42630),[42631,42632),[42633,42634),[42635,42636),[42637,42638),[42639,42640),[42641,42642),[42643,42644),[42645,42646),[42647,42648),[42649,42650),[42651,42652),[42787,42788),[42789,42790),[42791,42792),[42793,42794),[42795,42796),[42797,42798),[42799,42800),[42803,42804),[42805,42806),[42807,42808),[42809,42810),[42811,42812),[42813,42814),[42815,42816),[42817,42818),[42819,42820),[42821,42822),[42823,42824),[42825,42826),[42827,42828),[42829,42830),[42831,42832),[42833,42834),[42835,42836),[42837,42838),[42839,42840),[42841,42842),[42843,42844),[42845,42846),[42847,42848),[42849,42850),[42851,42852),[42853,42854),[42855,42856),[42857,42858),[42859,42860),[42861,42862),[42863,42864),[42874,42875),[42876,42877),[42879,42880),[42881,42882),[42883,42884),[42885,42886),[42887,42888),[42892,42893),[42897,42898),[42899,42901),[42903,42904),[42905,42906),[42907,42908),[42909,42910),[42911,42912),[42913,42914),[42915,42916),[42917,42918),[42919,42920),[42921,42922),[42933,42934),[42935,42936),[42937,42938),[42939,42940),[42941,42942),[42943,42944),[42945,42946),[42947,42948),[42952,42953),[42954,42955),[42957,42958),[42959,42960),[42961,42962),[42963,42964),[42965,42966),[42967,42968),[42969,42970),[42971,42972),[42998,42999),[43859,43860),[43888,43968),[64256,64263),[64275,64280),[65279,65280),[65345,65371),[65529,65532),[66600,66640),[66776,66812),[66967,66978),[66979,66994),[66995,67002),[67003,67005),[68800,68851),[68976,68998),[69821,69822),[69837,69838),[71872,71904),[78896,78912),[93792,93824),[93883,93908),[113824,113828),[119155,119163),[125218,125252),[917505,917506),[917536,917632)}';
 trim_points constant integer[]:=array[9,10,11,12,13,32,160,5760,8192,8193,8194,8195,8196,8197,8198,8199,8200,8201,8202,8232,8233,8239,8287,12288,65279];
begin
 if n is null or n='' or ascii(left(n,1))=any(trim_points) or ascii(right(n,1))=any(trim_points) then return false;end if;
 for c in select regexp_split_to_table(n,'') loop
  cp:=ascii(c);units:=units+case when cp>65535 then 2 else 1 end;
  if units>60 or cp<@bad then return false;end if;
 end loop;
 return true;
end $$;

create function public.phase5_class_cohort_request(q jsonb) returns void
language plpgsql immutable set search_path=pg_catalog,public as $$
declare n jsonb;k text;d date;y integer;
begin
 if jsonb_typeof(q) is distinct from 'object' or not(q ?& array['commandId','offeringId','unitId','expectedEducationRevision','expectedSourceToken','startsOn','names'])
 or (q-array['commandId','offeringId','unitId','expectedEducationRevision','expectedSourceToken','startsOn','names'])<>'{}'::jsonb then
  raise exception 'Invalid class cohort request' using errcode='22023';end if;
 foreach k in array array['commandId','offeringId','unitId'] loop
  if jsonb_typeof(q->k)<>'string' or (q->>k)!~'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$' then
   raise exception 'Invalid class cohort ID' using errcode='22023';end if;
 end loop;
 if jsonb_typeof(q->'expectedEducationRevision') is distinct from 'number' or (q->>'expectedEducationRevision')!~'^(0|[1-9][0-9]*)$'
 or (q->>'expectedEducationRevision')::numeric>2147483647
 or jsonb_typeof(q->'expectedSourceToken') is distinct from 'string' or (q->>'expectedSourceToken')!~'^[0-9a-f]{64}$'
 or jsonb_typeof(q->'startsOn') is distinct from 'string' or public.phase5_class_cohort_date(q->>'startsOn') is null
 or jsonb_typeof(q->'names') is distinct from 'array' then raise exception 'Invalid class cohort source' using errcode='22023';end if;
 d:=public.phase5_class_cohort_date(q->>'startsOn');y:=extract(year from d)::integer-case when extract(month from d)<7 then 1 else 0 end;
 if y not between 2000 and 2100 then raise exception 'Invalid class cohort year' using errcode='22023';end if;
 if jsonb_array_length(q->'names') not between 1 and 20 then raise exception 'Invalid class cohort size' using errcode='22023';end if;
 for n in select value from jsonb_array_elements(q->'names') loop
  if jsonb_typeof(n) is distinct from 'string' or not public.phase5_class_cohort_name(n#>>'{}') then raise exception 'Invalid class name' using errcode='22023';end if;
 end loop;
 if (select count(*)<>count(distinct value) from jsonb_array_elements(q->'names')) then raise exception 'Duplicate class name' using errcode='22023';end if;
end $$;

create function public.phase5_class_cohort_audit(object_id uuid,operation text) returns void
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare a public.access_assignments;s public.app_sessions;i public.identities;
begin
 if object_id is null or operation not in ('class_cohort_read','class_cohort_status_read','class_cohort_created') then raise exception 'Invalid cohort audit' using errcode='22023';end if;
 a:=public.phase5_programplan_actor();s:=public.phase5_programplan_session_check();select * into i from public.identities where id=s.identity_id;
 begin
 insert into public.security_events(correlation_id,source,actor_identity_id,actor_issuer,actor_subject,session_id,membership_id,assignment_id,customer_id,action,object_type,object_id,outcome,details)
 values(nullif(current_setting('app.correlation_id',true),'')::uuid,'db',i.id,i.issuer,i.subject,s.id,a.membership_id,a.id,a.customer_id,operation,
 case when operation='class_cohort_read' then 'education' else 'education_command' end,object_id,'ok','{}');
 exception when others then raise exception 'Cohort audit unavailable' using errcode='55000';end;
end $$;

create function public.phase5_class_cohort_class(c public.school_classes) returns jsonb
language sql immutable set search_path=pg_catalog,public as $$
 select jsonb_build_object('id',c.id,'name',c.name,'cohortStartYear',c.start_year,'startsOn',to_char(c.starts_on,'YYYY-MM-DD'),'endsOn',to_char(c.ends_on,'YYYY-MM-DD'),'validitySource',c.validity_source)
$$;

-- Caller holds offering lock before these ordered plan locks. Source mutation
-- guards use NOWAIT in the reverse row path, preventing lock-order inversion.
create function public.phase5_class_cohort_source(o public.offerings) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare d date;y integer;versions jsonb;token text;
begin
 perform public.phase5_class_cohort_lock(o.id);
 perform 1 from public.point_plans p where p.offering_id=o.id order by p.id for update;
 d:=public.phase5_class_cohort_starts_on(o.id);
 if d is not null then
  y:=extract(year from d)::integer-case when extract(month from d)<7 then 1 else 0 end;
  if y not between 1 and 9998 then d:=null;y:=null;end if;
 end if;
 if d is not null then
  select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'version',p.version,'revision',p.revision,'status',p.status,'catalogId',p.catalog_id,
   'basisCatalogId',p.basis_reference->>'catalogId','hasBasis',p.basis_reference is not null,'startedOn',p.basis_reference->>'startedOn') order by p.id),'[]') into versions
   from public.point_plans p where p.offering_id=o.id;
  token:=encode(sha256(convert_to(jsonb_build_object('calendarStartYear',o.start_year,'versions',versions)::text,'UTF8')),'hex');
 end if;
 return jsonb_build_object('educationStartsOn',to_char(d,'YYYY-MM-DD'),'firstSchoolYear',y,'sourceToken',token);
end $$;

create function public.phase5_class_cohort_underlag(offering_id uuid,unit_id uuid) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare o public.offerings;a public.access_assignments;source jsonb;classes jsonb;blockers jsonb:='[]';school text;total integer;
begin
 o:=public.phase5_gym_timplan_scope(offering_id,unit_id,false);a:=public.phase5_programplan_actor();
 source:=public.phase5_class_cohort_source(o);
 select count(*) into total from public.school_classes c where c.offering_id=o.id and c.unit_id=phase5_class_cohort_underlag.unit_id;
 if total>2000 then raise exception 'Class list exceeds safe limit' using errcode='54000';end if;
 select coalesce(jsonb_agg(public.phase5_class_cohort_class(c) order by c.name,c.start_year,c.id),'[]') into classes
 from public.school_classes c where c.offering_id=o.id and c.unit_id=phase5_class_cohort_underlag.unit_id;
 if source->>'educationStartsOn' is null then blockers:=blockers||jsonb_build_array('Utbildningen saknar ett entydigt verifierat startdatum.');end if;
 if o.archived_at is not null then blockers:=blockers||jsonb_build_array('Utbildningen är arkiverad.');end if;
 if (source->>'firstSchoolYear')::integer not between 2000 and 2100 then blockers:=blockers||jsonb_build_array('Startläsåret ligger utanför intervallet för nya klasser.');end if;
 if total>=2000 then blockers:=blockers||jsonb_build_array('Skolan har nått gränsen för antal klasser i utbildningen.');end if;
 select u.name into school from public.school_units u where u.id=unit_id;
 perform public.phase5_class_cohort_audit(o.id,'class_cohort_read');
 return jsonb_build_object('offeringId',o.id,'unitId',unit_id,'educationName',o.name,'schoolName',school,'educationRevision',o.lifecycle_revision,
 'canManage',a.function in ('rektor','administrator') and blockers='[]'::jsonb,'blockers',blockers,'classes',classes)||source;
end $$;

-- Receipt paths recheck live scope/role before reading the immutable request.
-- They deliberately do not recheck current source CAS or archive state.
create function public.phase5_class_cohort_status(q jsonb) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare o public.offerings;a public.access_assignments;r public.class_cohort_commands;
begin
 perform public.phase5_class_cohort_request(q);
 o:=public.phase5_gym_timplan_scope((q->>'offeringId')::uuid,(q->>'unitId')::uuid,false);a:=public.phase5_programplan_actor();
 if a.function not in ('rektor','administrator') then raise exception 'Class cohort denied' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(((q->>'commandId')::uuid)::text,5523));
 select * into r from public.class_cohort_commands where command_id=(q->>'commandId')::uuid;
 if found and (r.actor_identity_id<>public.current_identity_id() or r.assignment_id<>a.id or r.request<>q) then raise exception 'Class cohort request conflict' using errcode='40001';end if;
 perform public.phase5_class_cohort_audit((q->>'commandId')::uuid,'class_cohort_status_read');
 return jsonb_build_object('commandId',q->>'commandId','offeringId',o.id,'unitId',q->>'unitId','status',case when r.command_id is null then 'not_found' else 'found' end,
 'receipt',case when r.command_id is null then null else r.reply||'{"replayed":true}'::jsonb end);
end $$;

create function public.phase5_class_cohort_command(q jsonb) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare o public.offerings;a public.access_assignments;r public.class_cohort_commands;source jsonb;c public.school_classes;n text;classes jsonb:='[]';reply jsonb;y integer;total integer;
begin
 perform public.phase5_class_cohort_request(q);
 o:=public.phase5_gym_timplan_scope((q->>'offeringId')::uuid,(q->>'unitId')::uuid,false);a:=public.phase5_programplan_actor();
 if a.function not in ('rektor','administrator') then raise exception 'Class cohort denied' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(((q->>'commandId')::uuid)::text,5523));
 select * into r from public.class_cohort_commands where command_id=(q->>'commandId')::uuid;
 if found then
  if r.actor_identity_id<>public.current_identity_id() or r.assignment_id<>a.id or r.request<>q then raise exception 'Class cohort request conflict' using errcode='40001';end if;
  perform public.phase5_class_cohort_audit(r.command_id,'class_cohort_status_read');
  return r.reply||'{"replayed":true}'::jsonb;
 end if;
 source:=public.phase5_class_cohort_source(o);y:=(source->>'firstSchoolYear')::integer;
 if o.archived_at is not null or source->>'sourceToken' is null or y not between 2000 and 2100 then
  raise exception 'Class cohort source not ready' using errcode='40001',hint='class_plan_not_ready';end if;
 if o.lifecycle_revision<>(q->>'expectedEducationRevision')::integer or source->>'sourceToken'<>q->>'expectedSourceToken'
 or source->>'educationStartsOn'<>q->>'startsOn' then raise exception 'Class cohort source changed' using errcode='40001';end if;
 select count(*) into total from public.school_classes sc where sc.offering_id=o.id and sc.unit_id=(q->>'unitId')::uuid;
 if total+jsonb_array_length(q->'names')>2000 then raise exception 'Class cohort size limit' using errcode='40001';end if;
 -- School scope locks serialize cross-offering names, also with existing create.
 if exists(select 1 from public.school_classes sc where sc.unit_id=(q->>'unitId')::uuid and sc.start_year=y and sc.name in(select jsonb_array_elements_text(q->'names'))) then
  raise exception 'Class name and year conflict' using errcode='40001',hint='class_name_year_conflict';end if;
 for n in select jsonb_array_elements_text(q->'names') loop
  insert into public.school_classes(customer_id,organizer_id,unit_id,offering_id,name,start_year,starts_on,ends_on,validity_source)
  values(a.customer_id,o.organizer_id,(q->>'unitId')::uuid,o.id,n,y,(q->>'startsOn')::date,null,'education_start') returning * into c;
  perform public.phase5_class_audit(c.id,'class_created');classes:=classes||jsonb_build_array(public.phase5_class_cohort_class(c));
 end loop;
 reply:=jsonb_build_object('commandId',q->>'commandId','offeringId',o.id,'unitId',q->>'unitId','startsOn',q->>'startsOn','classes',classes,'replayed',false);
 perform public.phase5_class_cohort_audit((q->>'commandId')::uuid,'class_cohort_created');
 insert into public.class_cohort_commands(command_id,actor_identity_id,assignment_id,request,reply) values((q->>'commandId')::uuid,public.current_identity_id(),a.id,q,reply);
 return reply;
end $$;

revoke all on function public.phase5_class_cohort_name(text),public.phase5_class_cohort_request(jsonb),public.phase5_class_cohort_audit(uuid,text),public.phase5_class_cohort_class(public.school_classes),public.phase5_class_cohort_source(public.offerings),public.phase5_class_cohort_underlag(uuid,uuid),public.phase5_class_cohort_command(jsonb),public.phase5_class_cohort_status(jsonb) from public,anon,authenticated,service_role,skolplattform_worker;
grant execute on function public.phase5_class_cohort_underlag(uuid,uuid),public.phase5_class_cohort_command(jsonb),public.phase5_class_cohort_status(jsonb) to skolplattform_worker;
