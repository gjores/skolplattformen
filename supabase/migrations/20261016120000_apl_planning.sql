-- APL stage 1: closed, additive planning storage. Existing hours, decisions,
-- classes and receipts are never rewritten by this migration.
-- Planned GUT is a subset of total teaching time, not workplace attendance.

create function public.phase5_apl_text(v jsonb, maximum integer, allow_empty boolean default true) returns boolean
language plpgsql immutable set search_path=pg_catalog,public as $$
declare n text;c text;cp integer;
 forbidden constant int4multirange:='{[1,32),[127,160),[173,174),[1536,1542),[1564,1565),[1757,1758),[1807,1808),[2192,2194),[2274,2275),[6158,6159),[8203,8208),[8234,8239),[8288,8293),[8294,8304),[55296,57344),[65279,65280),[65529,65532),[69821,69822),[69837,69838),[78896,78912),[113824,113828),[119155,119163),[917505,917506),[917536,917632)}';
 trim_points constant integer[]:=array[9,10,11,12,13,32,160,5760,8192,8193,8194,8195,8196,8197,8198,8199,8200,8201,8202,8232,8233,8239,8287,12288,65279];
begin
 if jsonb_typeof(v) is distinct from 'string' then return false;end if;n:=v#>>'{}';
 if char_length(n)>maximum or (not allow_empty and n='') then return false;end if;
 if n='' then return true;end if;
 if ascii(left(n,1))=any(trim_points) or ascii(right(n,1))=any(trim_points) then return false;end if;
 for c in select regexp_split_to_table(n,'') loop cp:=ascii(c);if cp<@forbidden then return false;end if;end loop;
 return true;
end $$;

create function public.phase5_apl_date(v jsonb) returns boolean
language sql immutable security definer set search_path=pg_catalog,public as $$
 select public.phase5_programplan_date(v) and left(v#>>'{}',4)<>'0000'
$$;

create function public.phase5_apl_uuid(v jsonb) returns uuid
language plpgsql immutable set search_path=pg_catalog,public as $$
begin
 if jsonb_typeof(v) is distinct from 'string' or (v#>>'{}')!~*'^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
  raise exception 'Ogiltig APL-identitet.' using errcode='22023',hint='invalid_apl_plan';end if;
 return (v#>>'{}')::uuid;
end $$;

-- Exact gymRowKey / parseProgramplanTermDistribution contract.
-- Unicode L/N ranges generated with Node v25.9.0, Unicode 17.0, ICU 78.3.
-- Ranges are explicit: PostgreSQL collation/locale never decides Unicode category membership.
create function public.phase5_apl_row_key(v jsonb) returns boolean
language plpgsql immutable security definer set search_path=pg_catalog,public as $$
declare
 key_text text; remainder text; section text; members text[]; member text; fields text[]; code_text text; character_text text;
 utf16_length integer; char_index integer; codepoint integer;
 letters constant int4multirange:='{[65,91),[97,123),[170,171),[181,182),[186,187),[192,215),[216,247),[248,706),[710,722),[736,741),[748,749),[750,751),[880,885),[886,888),[890,894),[895,896),[902,903),[904,907),[908,909),[910,930),[931,1014),[1015,1154),[1162,1328),[1329,1367),[1369,1370),[1376,1417),[1488,1515),[1519,1523),[1568,1611),[1646,1648),[1649,1748),[1749,1750),[1765,1767),[1774,1776),[1786,1789),[1791,1792),[1808,1809),[1810,1840),[1869,1958),[1969,1970),[1994,2027),[2036,2038),[2042,2043),[2048,2070),[2074,2075),[2084,2085),[2088,2089),[2112,2137),[2144,2155),[2160,2184),[2185,2192),[2208,2250),[2308,2362),[2365,2366),[2384,2385),[2392,2402),[2417,2433),[2437,2445),[2447,2449),[2451,2473),[2474,2481),[2482,2483),[2486,2490),[2493,2494),[2510,2511),[2524,2526),[2527,2530),[2544,2546),[2556,2557),[2565,2571),[2575,2577),[2579,2601),[2602,2609),[2610,2612),[2613,2615),[2616,2618),[2649,2653),[2654,2655),[2674,2677),[2693,2702),[2703,2706),[2707,2729),[2730,2737),[2738,2740),[2741,2746),[2749,2750),[2768,2769),[2784,2786),[2809,2810),[2821,2829),[2831,2833),[2835,2857),[2858,2865),[2866,2868),[2869,2874),[2877,2878),[2908,2910),[2911,2914),[2929,2930),[2947,2948),[2949,2955),[2958,2961),[2962,2966),[2969,2971),[2972,2973),[2974,2976),[2979,2981),[2984,2987),[2990,3002),[3024,3025),[3077,3085),[3086,3089),[3090,3113),[3114,3130),[3133,3134),[3160,3163),[3164,3166),[3168,3170),[3200,3201),[3205,3213),[3214,3217),[3218,3241),[3242,3252),[3253,3258),[3261,3262),[3292,3295),[3296,3298),[3313,3315),[3332,3341),[3342,3345),[3346,3387),[3389,3390),[3406,3407),[3412,3415),[3423,3426),[3450,3456),[3461,3479),[3482,3506),[3507,3516),[3517,3518),[3520,3527),[3585,3633),[3634,3636),[3648,3655),[3713,3715),[3716,3717),[3718,3723),[3724,3748),[3749,3750),[3751,3761),[3762,3764),[3773,3774),[3776,3781),[3782,3783),[3804,3808),[3840,3841),[3904,3912),[3913,3949),[3976,3981),[4096,4139),[4159,4160),[4176,4182),[4186,4190),[4193,4194),[4197,4199),[4206,4209),[4213,4226),[4238,4239),[4256,4294),[4295,4296),[4301,4302),[4304,4347),[4348,4681),[4682,4686),[4688,4695),[4696,4697),[4698,4702),[4704,4745),[4746,4750),[4752,4785),[4786,4790),[4792,4799),[4800,4801),[4802,4806),[4808,4823),[4824,4881),[4882,4886),[4888,4955),[4992,5008),[5024,5110),[5112,5118),[5121,5741),[5743,5760),[5761,5787),[5792,5867),[5873,5881),[5888,5906),[5919,5938),[5952,5970),[5984,5997),[5998,6001),[6016,6068),[6103,6104),[6108,6109),[6176,6265),[6272,6277),[6279,6313),[6314,6315),[6320,6390),[6400,6431),[6480,6510),[6512,6517),[6528,6572),[6576,6602),[6656,6679),[6688,6741),[6823,6824),[6917,6964),[6981,6989),[7043,7073),[7086,7088),[7098,7142),[7168,7204),[7245,7248),[7258,7294),[7296,7307),[7312,7355),[7357,7360),[7401,7405),[7406,7412),[7413,7415),[7418,7419),[7424,7616),[7680,7958),[7960,7966),[7968,8006),[8008,8014),[8016,8024),[8025,8026),[8027,8028),[8029,8030),[8031,8062),[8064,8117),[8118,8125),[8126,8127),[8130,8133),[8134,8141),[8144,8148),[8150,8156),[8160,8173),[8178,8181),[8182,8189),[8305,8306),[8319,8320),[8336,8349),[8450,8451),[8455,8456),[8458,8468),[8469,8470),[8473,8478),[8484,8485),[8486,8487),[8488,8489),[8490,8494),[8495,8506),[8508,8512),[8517,8522),[8526,8527),[8579,8581),[11264,11493),[11499,11503),[11506,11508),[11520,11558),[11559,11560),[11565,11566),[11568,11624),[11631,11632),[11648,11671),[11680,11687),[11688,11695),[11696,11703),[11704,11711),[11712,11719),[11720,11727),[11728,11735),[11736,11743),[11823,11824),[12293,12295),[12337,12342),[12347,12349),[12353,12439),[12445,12448),[12449,12539),[12540,12544),[12549,12592),[12593,12687),[12704,12736),[12784,12800),[13312,19904),[19968,42125),[42192,42238),[42240,42509),[42512,42528),[42538,42540),[42560,42607),[42623,42654),[42656,42726),[42775,42784),[42786,42889),[42891,42973),[42993,43010),[43011,43014),[43015,43019),[43020,43043),[43072,43124),[43138,43188),[43250,43256),[43259,43260),[43261,43263),[43274,43302),[43312,43335),[43360,43389),[43396,43443),[43471,43472),[43488,43493),[43494,43504),[43514,43519),[43520,43561),[43584,43587),[43588,43596),[43616,43639),[43642,43643),[43646,43696),[43697,43698),[43701,43703),[43705,43710),[43712,43713),[43714,43715),[43739,43742),[43744,43755),[43762,43765),[43777,43783),[43785,43791),[43793,43799),[43808,43815),[43816,43823),[43824,43867),[43868,43882),[43888,44003),[44032,55204),[55216,55239),[55243,55292),[63744,64110),[64112,64218),[64256,64263),[64275,64280),[64285,64286),[64287,64297),[64298,64311),[64312,64317),[64318,64319),[64320,64322),[64323,64325),[64326,64434),[64467,64830),[64848,64912),[64914,64968),[65008,65020),[65136,65141),[65142,65277),[65313,65339),[65345,65371),[65382,65471),[65474,65480),[65482,65488),[65490,65496),[65498,65501),[65536,65548),[65549,65575),[65576,65595),[65596,65598),[65599,65614),[65616,65630),[65664,65787),[66176,66205),[66208,66257),[66304,66336),[66349,66369),[66370,66378),[66384,66422),[66432,66462),[66464,66500),[66504,66512),[66560,66718),[66736,66772),[66776,66812),[66816,66856),[66864,66916),[66928,66939),[66940,66955),[66956,66963),[66964,66966),[66967,66978),[66979,66994),[66995,67002),[67003,67005),[67008,67060),[67072,67383),[67392,67414),[67424,67432),[67456,67462),[67463,67505),[67506,67515),[67584,67590),[67592,67593),[67594,67638),[67639,67641),[67644,67645),[67647,67670),[67680,67703),[67712,67743),[67808,67827),[67828,67830),[67840,67862),[67872,67898),[67904,67930),[67968,68024),[68030,68032),[68096,68097),[68112,68116),[68117,68120),[68121,68150),[68192,68221),[68224,68253),[68288,68296),[68297,68325),[68352,68406),[68416,68438),[68448,68467),[68480,68498),[68608,68681),[68736,68787),[68800,68851),[68864,68900),[68938,68966),[68975,68998),[69248,69290),[69296,69298),[69314,69320),[69376,69405),[69415,69416),[69424,69446),[69488,69506),[69552,69573),[69600,69623),[69635,69688),[69745,69747),[69749,69750),[69763,69808),[69840,69865),[69891,69927),[69956,69957),[69959,69960),[69968,70003),[70006,70007),[70019,70067),[70081,70085),[70106,70107),[70108,70109),[70144,70162),[70163,70188),[70207,70209),[70272,70279),[70280,70281),[70282,70286),[70287,70302),[70303,70313),[70320,70367),[70405,70413),[70415,70417),[70419,70441),[70442,70449),[70450,70452),[70453,70458),[70461,70462),[70480,70481),[70493,70498),[70528,70538),[70539,70540),[70542,70543),[70544,70582),[70583,70584),[70609,70610),[70611,70612),[70656,70709),[70727,70731),[70751,70754),[70784,70832),[70852,70854),[70855,70856),[71040,71087),[71128,71132),[71168,71216),[71236,71237),[71296,71339),[71352,71353),[71424,71451),[71488,71495),[71680,71724),[71840,71904),[71935,71943),[71945,71946),[71948,71956),[71957,71959),[71960,71984),[71999,72000),[72001,72002),[72096,72104),[72106,72145),[72161,72162),[72163,72164),[72192,72193),[72203,72243),[72250,72251),[72272,72273),[72284,72330),[72349,72350),[72368,72441),[72640,72673),[72704,72713),[72714,72751),[72768,72769),[72818,72848),[72960,72967),[72968,72970),[72971,73009),[73030,73031),[73056,73062),[73063,73065),[73066,73098),[73112,73113),[73136,73180),[73440,73459),[73474,73475),[73476,73489),[73490,73524),[73648,73649),[73728,74650),[74880,75076),[77712,77809),[77824,78896),[78913,78919),[78944,82939),[82944,83527),[90368,90398),[92160,92729),[92736,92767),[92784,92863),[92880,92910),[92928,92976),[92992,92996),[93027,93048),[93053,93072),[93504,93549),[93760,93824),[93856,93881),[93883,93908),[93952,94027),[94032,94033),[94099,94112),[94176,94178),[94179,94180),[94194,94196),[94208,101590),[101631,101663),[101760,101875),[110576,110580),[110581,110588),[110589,110591),[110592,110883),[110898,110899),[110928,110931),[110933,110934),[110948,110952),[110960,111356),[113664,113771),[113776,113789),[113792,113801),[113808,113818),[119808,119893),[119894,119965),[119966,119968),[119970,119971),[119973,119975),[119977,119981),[119982,119994),[119995,119996),[119997,120004),[120005,120070),[120071,120075),[120077,120085),[120086,120093),[120094,120122),[120123,120127),[120128,120133),[120134,120135),[120138,120145),[120146,120486),[120488,120513),[120514,120539),[120540,120571),[120572,120597),[120598,120629),[120630,120655),[120656,120687),[120688,120713),[120714,120745),[120746,120771),[120772,120780),[122624,122655),[122661,122667),[122928,122990),[123136,123181),[123191,123198),[123214,123215),[123536,123566),[123584,123628),[124112,124140),[124368,124398),[124400,124401),[124608,124639),[124640,124643),[124644,124646),[124647,124654),[124656,124661),[124670,124672),[124896,124903),[124904,124908),[124909,124911),[124912,124927),[124928,125125),[125184,125252),[125259,125260),[126464,126468),[126469,126496),[126497,126499),[126500,126501),[126503,126504),[126505,126515),[126516,126520),[126521,126522),[126523,126524),[126530,126531),[126535,126536),[126537,126538),[126539,126540),[126541,126544),[126545,126547),[126548,126549),[126551,126552),[126553,126554),[126555,126556),[126557,126558),[126559,126560),[126561,126563),[126564,126565),[126567,126571),[126572,126579),[126580,126584),[126585,126589),[126590,126591),[126592,126602),[126603,126620),[126625,126628),[126629,126634),[126635,126652),[131072,173792),[173824,178206),[178208,183982),[183984,191457),[191472,192094),[194560,195102),[196608,201547),[201552,210042)}';
 numbers constant int4multirange:='{[48,58),[178,180),[185,186),[188,191),[1632,1642),[1776,1786),[1984,1994),[2406,2416),[2534,2544),[2548,2554),[2662,2672),[2790,2800),[2918,2928),[2930,2936),[3046,3059),[3174,3184),[3192,3199),[3302,3312),[3416,3423),[3430,3449),[3558,3568),[3664,3674),[3792,3802),[3872,3892),[4160,4170),[4240,4250),[4969,4989),[5870,5873),[6112,6122),[6128,6138),[6160,6170),[6470,6480),[6608,6619),[6784,6794),[6800,6810),[6992,7002),[7088,7098),[7232,7242),[7248,7258),[8304,8305),[8308,8314),[8320,8330),[8528,8579),[8581,8586),[9312,9372),[9450,9472),[10102,10132),[11517,11518),[12295,12296),[12321,12330),[12344,12347),[12690,12694),[12832,12842),[12872,12880),[12881,12896),[12928,12938),[12977,12992),[42528,42538),[42726,42736),[43056,43062),[43216,43226),[43264,43274),[43472,43482),[43504,43514),[43600,43610),[44016,44026),[65296,65306),[65799,65844),[65856,65913),[65930,65932),[66273,66300),[66336,66340),[66369,66370),[66378,66379),[66513,66518),[66720,66730),[67672,67680),[67705,67712),[67751,67760),[67835,67840),[67862,67868),[68028,68030),[68032,68048),[68050,68096),[68160,68169),[68221,68223),[68253,68256),[68331,68336),[68440,68448),[68472,68480),[68521,68528),[68858,68864),[68912,68922),[68928,68938),[69216,69247),[69405,69415),[69457,69461),[69573,69580),[69714,69744),[69872,69882),[69942,69952),[70096,70106),[70113,70133),[70384,70394),[70736,70746),[70864,70874),[71248,71258),[71360,71370),[71376,71396),[71472,71484),[71904,71923),[72016,72026),[72688,72698),[72784,72813),[73040,73050),[73120,73130),[73184,73194),[73552,73562),[73664,73685),[74752,74863),[90416,90426),[92768,92778),[92864,92874),[93008,93018),[93019,93026),[93552,93562),[93824,93847),[94196,94199),[118000,118010),[119488,119508),[119520,119540),[119648,119673),[120782,120832),[123200,123210),[123632,123642),[124144,124154),[124401,124411),[125127,125136),[125264,125274),[126065,126124),[126125,126128),[126129,126133),[126209,126254),[126255,126270),[127232,127245),[130032,130042)}';
begin
 if jsonb_typeof(v) is distinct from 'string' then return false;end if;
 key_text:=v#>>'{}';
 select coalesce(sum(case when octet_length(c)=4 then 2 else 1 end),0)::integer into utf16_length
 from regexp_split_to_table(key_text,'') c;
 if utf16_length=0 or utf16_length>320 then return false;end if;
 if key_text in ('meta:individualChoice','meta:diplomaWork') then return true;end if;
 if starts_with(key_text,'block:') then return key_text collate "C" ~ '^block:[a-z][a-z0-9]{0,15}$';end if;
 if starts_with(key_text,'alternative:') then
  remainder:=substr(key_text,13);section:=split_part(remainder,':',1);
  members:=string_to_array(substr(remainder,char_length(section)+2),'+');
  if cardinality(members)<2 then return false;end if;
 else
  section:=split_part(key_text,':',1);
  members:=array[substr(key_text,char_length(section)+2)];
 end if;
 if section not in ('foundation','programmeSpecific','orientation','specialization') then return false;end if;
 foreach member in array members loop
  fields:=string_to_array(member,':');
  if cardinality(fields)<>3 then return false;end if;
  if fields[2] collate "C" !~ '^[1-9][0-9]{0,5}$' then return false;end if;
  foreach code_text in array array[fields[1],fields[3]] loop
   if code_text='' then return false;end if;
   char_index:=0;
   for character_text in select regexp_split_to_table(code_text,'') loop
    char_index:=char_index+1;codepoint:=ascii(character_text);
    if char_index=1 then
     if not codepoint<@letters then return false;end if;
    elsif not(codepoint<@letters or codepoint<@numbers or codepoint in (95,45)) then return false;
    end if;
   end loop;
  end loop;
 end loop;
 return true;
end $$;
revoke all on function public.phase5_apl_row_key(jsonb) from public,anon,authenticated,service_role,skolplattform_worker;

-- Normalizes UUID spelling only. Array order and text remain the exact request.
create function public.phase5_apl_plan_parse(v jsonb) returns jsonb
language plpgsql immutable security definer set search_path=pg_catalog,public as $$
declare p jsonb;e jsonb;c jsonb;a jsonb;periods jsonb:='[]';seen uuid[]:='{}';pid uuid;
 total_allocations integer:=0;
begin
 if not public.phase5_programplan_shape(v,array['contractVersion','educationForm','classification','periods'])
 or v->>'contractVersion' is distinct from 'structured_v1'
 or v->>'educationForm' is null or v->>'educationForm' not in ('school_based','apprenticeship','unknown')
 or v->>'classification' is null or v->>'classification' not in ('unreviewed','complete')
 or not public.phase5_programplan_array(v->'periods',100) then
  raise exception 'Ogiltigt APL-underlag.' using errcode='22023',hint='invalid_apl_plan';end if;
 for p in select value from jsonb_array_elements(v->'periods') loop
  if not public.phase5_programplan_shape(p,array['id','name','startsOn','endsOn','schoolYear','extent','contents','allocations'])
  or not public.phase5_apl_text(p->'name',120)
  or (p->'startsOn'<>'null'::jsonb and not public.phase5_apl_date(p->'startsOn'))
  or (p->'endsOn'<>'null'::jsonb and not public.phase5_apl_date(p->'endsOn'))
  or (p->'startsOn'<>'null'::jsonb and p->'endsOn'<>'null'::jsonb and p->>'startsOn'>p->>'endsOn')
  or (p->'schoolYear'<>'null'::jsonb and not public.phase5_programplan_integer(p->'schoolYear',2000,2100))
  or not public.phase5_programplan_array(p->'contents',200) or not public.phase5_programplan_array(p->'allocations',1200) then
   raise exception 'Ogiltig APL-period.' using errcode='22023',hint='invalid_apl_plan';end if;
  pid:=public.phase5_apl_uuid(p->'id');
  if pid=any(seen) then raise exception 'APL-perioden finns flera gånger.' using errcode='22023',hint='duplicate';end if;
  seen:=array_append(seen,pid);e:=p->'extent';
  if not public.phase5_programplan_shape(e,array['basis','weeks','reviewed','reviewNote'])
  or e->>'basis' is null or e->>'basis' not in ('whole_weeks','mixed_weeks','unknown')
  or jsonb_typeof(e->'reviewed') is distinct from 'boolean' or not public.phase5_apl_text(e->'reviewNote',2000)
  or (e->'weeks'<>'null'::jsonb and not public.phase5_programplan_integer(e->'weeks',1,160))
  or (e->>'basis'<>'whole_weeks' and (e->'weeks'<>'null'::jsonb or e->'reviewed'<>'false'::jsonb))
  or (e->'reviewed'='true'::jsonb and (e->'weeks'='null'::jsonb or e->>'reviewNote'='')) then
   raise exception 'Ogiltigt omfattningsunderlag för APL.' using errcode='22023',hint='invalid_apl_plan';end if;
  for c in select value from jsonb_array_elements(p->'contents') loop
   if not public.phase5_programplan_shape(c,array['rowKey','description'])
   or not public.phase5_apl_row_key(c->'rowKey') or not public.phase5_apl_text(c->'description',2000) then
    raise exception 'Ogiltig innehållskoppling.' using errcode='22023',hint='invalid_apl_plan';end if;
  end loop;
  if (select count(*)<>count(distinct value->>'rowKey') from jsonb_array_elements(p->'contents')) then
   raise exception 'Innehållskopplingen finns flera gånger.' using errcode='22023',hint='duplicate';end if;
  for a in select value from jsonb_array_elements(p->'allocations') loop
   if not public.phase5_programplan_shape(a,array['rowKey','termIndex','gutMinutes'])
   or not public.phase5_apl_row_key(a->'rowKey')
   or not public.phase5_programplan_integer(a->'termIndex',0,5)
   or not public.phase5_programplan_integer(a->'gutMinutes',0,120000) then
    raise exception 'Ogiltig tidsfördelning.' using errcode='22023',hint='invalid_apl_plan';end if;
   if not exists(select 1 from jsonb_array_elements(p->'contents') x where x->>'rowKey'=a->>'rowKey') then
    raise exception 'Tidsfördelningen saknar innehållskoppling.' using errcode='22023',hint='allocation_without_content';end if;
  end loop;
  if (select count(*)<>count(distinct (value->>'rowKey',(value->>'termIndex')::integer)) from jsonb_array_elements(p->'allocations')) then
   raise exception 'Tidsfördelningen finns flera gånger.' using errcode='22023',hint='duplicate';end if;
  total_allocations:=total_allocations+jsonb_array_length(p->'allocations');
  periods:=periods||jsonb_build_array(p||jsonb_build_object('id',pid));
 end loop;
 if total_allocations>20000 then raise exception 'För många tidsfördelningar.' using errcode='22023',hint='invalid_apl_plan';end if;
 return v||jsonb_build_object('periods',periods);
end $$;

create function public.phase5_apl_plan_request(q jsonb) returns jsonb
language plpgsql immutable security definer set search_path=pg_catalog,public as $$
declare normalized jsonb;resolution jsonb;resolutions jsonb:='[]';seen uuid[]:='{}';rid uuid;
begin
 if jsonb_typeof(q) is distinct from 'object' or q->>'action' is null or q->>'action' not in ('save','confirm') then
  raise exception 'Ogiltigt APL-kommando.' using errcode='22023',hint='invalid_apl_plan';end if;
 if not public.phase5_programplan_shape(q,array['contractVersion','action','commandId','planId','expectedRevision']||
  case when q->>'action'='save' then array['plan','copyReviewResolutions'] else array['expectedContentHash','comment'] end)
 or q->>'contractVersion' is distinct from 'structured_v1'
 or not public.phase5_programplan_integer(q->'expectedRevision',0,2147483646) then
  raise exception 'Ogiltigt APL-kommando.' using errcode='22023',hint='invalid_apl_plan';end if;
 normalized:=q||jsonb_build_object('commandId',public.phase5_apl_uuid(q->'commandId'),'planId',public.phase5_apl_uuid(q->'planId'));
 if q->>'action'='save' then
  normalized:=normalized||jsonb_build_object('plan',public.phase5_apl_plan_parse(q->'plan'));
  if not public.phase5_programplan_array(q->'copyReviewResolutions',1000) then
   raise exception 'Ogiltig kopieringsgranskning.' using errcode='22023',hint='invalid_apl_plan';end if;
  for resolution in select value from jsonb_array_elements(q->'copyReviewResolutions') loop
   if not public.phase5_programplan_shape(resolution,array['id','note']) or not public.phase5_apl_text(resolution->'note',2000,false) then
    raise exception 'Beskriv hur granskningspunkten har hanterats.' using errcode='22023',hint='invalid_copy_review_resolution';end if;
   rid:=public.phase5_apl_uuid(resolution->'id');
   if rid=any(seen) then raise exception 'Granskningspunkten finns flera gånger.' using errcode='22023',hint='duplicate';end if;
   seen:=array_append(seen,rid);resolutions:=resolutions||jsonb_build_array(resolution||jsonb_build_object('id',rid));
  end loop;
  normalized:=normalized||jsonb_build_object('copyReviewResolutions',resolutions);
 else
  if jsonb_typeof(q->'expectedContentHash') is distinct from 'string' or q->>'expectedContentHash'!~'^sha256:[0-9a-f]{64}$'
   or not public.phase5_apl_text(q->'comment',2000,false) then
   raise exception 'Ogiltig bekräftelse av APL-förläggning.' using errcode='22023',hint='invalid_apl_plan';end if;
 end if;
 return normalized;
end $$;

create table public.apl_plan_underlag (
 plan_id uuid primary key references public.timplans(id) on delete restrict,
 organizer_id uuid not null references public.organizers(id),unit_id uuid not null references public.school_units(id),
 offering_id uuid not null references public.offerings(id),
 contract_version text not null default 'structured_v1' check(contract_version='structured_v1'),
 education_form text not null check(education_form in ('school_based','apprenticeship','unknown')),
 classification text not null check(classification in ('unreviewed','complete')),
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp()
);
create table public.apl_plan_periods (
 id uuid primary key,plan_id uuid not null references public.apl_plan_underlag(plan_id) on delete restrict,
 name text not null,starts_on date,ends_on date,school_year integer check(school_year between 2000 and 2100),
 extent_basis text not null check(extent_basis in ('whole_weeks','mixed_weeks','unknown')),
 whole_weeks integer check(whole_weeks between 1 and 160),reviewed boolean not null,review_note text not null,
 unique(plan_id,id),check(starts_on is null or ends_on is null or starts_on<=ends_on),
 check(extent_basis='whole_weeks' or (whole_weeks is null and not reviewed)),
 check(not reviewed or (whole_weeks is not null and review_note<>'')),
 check(public.phase5_apl_text(to_jsonb(name),120)),check(public.phase5_apl_text(to_jsonb(review_note),2000))
);
create table public.apl_period_contents (
 plan_id uuid not null,period_id uuid not null,row_key text not null,description text not null,
 primary key(plan_id,period_id,row_key),foreign key(plan_id,period_id) references public.apl_plan_periods(plan_id,id) on delete cascade,
 check(public.phase5_apl_text(to_jsonb(description),2000))
);
create table public.apl_time_allocations (
 plan_id uuid not null,period_id uuid not null,row_key text not null,term_index integer not null check(term_index between 0 and 5),
 gut_minutes integer not null check(gut_minutes between 0 and 120000),primary key(plan_id,period_id,row_key,term_index),
 foreign key(plan_id,period_id,row_key) references public.apl_period_contents(plan_id,period_id,row_key) on delete cascade
);
create table public.apl_plan_copy_reviews (
 id uuid primary key,plan_id uuid not null references public.apl_plan_underlag(plan_id) on delete restrict,
 source_plan_id uuid not null references public.timplans(id) on delete restrict,source_version integer not null check(source_version>0),
 source_period_id uuid not null,source_period_name text not null,
 reason text not null check(reason in ('missing_row','inactive_term','insufficient_total','unverified_source')),
 contents jsonb not null,allocations jsonb not null,
 resolved_actor_id uuid references public.identities(id),resolved_assignment_id uuid references public.access_assignments(id),resolved_at timestamptz,resolution_note text,
 check((resolved_actor_id is null and resolved_assignment_id is null and resolved_at is null and resolution_note is null)
  or (resolved_actor_id is not null and resolved_assignment_id is not null and resolved_at is not null and resolution_note is not null and public.phase5_apl_text(to_jsonb(resolution_note),2000,false))),
 check(jsonb_typeof(contents)='array' and jsonb_typeof(allocations)='array' and (jsonb_array_length(contents)>0 or jsonb_array_length(allocations)>0))
);
create table public.apl_rector_confirmations (
 id uuid primary key,plan_id uuid not null references public.apl_plan_underlag(plan_id) on delete restrict,
 unit_id uuid not null references public.school_units(id),actor_id uuid not null references public.identities(id),
 assignment_id uuid not null references public.access_assignments(id),actor_name text not null,
 occurred_at timestamptz not null,revision integer not null check(revision>0),content_hash text not null check(content_hash~'^sha256:[0-9a-f]{64}$'),comment text not null,
 unique(plan_id,revision),check(public.phase5_apl_text(to_jsonb(actor_name),200,false)),check(public.phase5_apl_text(to_jsonb(comment),2000,false))
);
create table public.apl_plan_commands (
 command_id uuid primary key,plan_id uuid not null references public.timplans(id) on delete restrict,
 organizer_id uuid not null references public.organizers(id),unit_id uuid not null references public.school_units(id),
 actor_identity_id uuid not null references public.identities(id),assignment_id uuid not null references public.access_assignments(id),
 action text not null check(action in ('save','confirm')),request jsonb not null,envelope jsonb not null,created_at timestamptz not null default clock_timestamp()
);
create table public.apl_plan_write_permits (
 transaction_id bigint not null,backend_id integer not null,plan_id uuid not null references public.timplans(id),
 primary key(transaction_id,backend_id,plan_id)
);

do $$declare n text;begin
 foreach n in array array['apl_plan_underlag','apl_plan_periods','apl_period_contents','apl_time_allocations','apl_plan_copy_reviews','apl_rector_confirmations','apl_plan_commands','apl_plan_write_permits'] loop
  execute format('alter table public.%I enable row level security',n);
  execute format('alter table public.%I force row level security',n);
  execute format('revoke all on public.%I from public,anon,authenticated,service_role,skolplattform_worker',n);
 end loop;
end $$;

create function public.phase5_apl_write_guard() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
declare pid uuid;p public.timplans;a public.access_assignments;
begin
 if tg_op='TRUNCATE' then raise exception 'APL-historik får inte tömmas.' using errcode='42501';end if;
 if tg_op<>'INSERT' and tg_table_name in ('apl_rector_confirmations','apl_plan_commands') then
  raise exception 'APL-kvitton och rektorshändelser är oföränderliga.' using errcode='42501';end if;
 pid:=case when tg_op='DELETE' then old.plan_id else new.plan_id end;
 if not exists(select 1 from public.apl_plan_write_permits w where w.transaction_id=txid_current() and w.backend_id=pg_backend_pid() and w.plan_id=pid)
 or (tg_op='UPDATE' and old.plan_id is distinct from new.plan_id) then
  raise exception 'APL kräver det skyddade kommandot.' using errcode='42501';end if;
 select * into p from public.timplans where id=pid;
 if p.gym_basis is null or p.status not in ('utkast','atersand') then
  raise exception 'APL-underlaget är låst för beslut.' using errcode='42501';end if;
 if tg_table_name='apl_plan_underlag' and tg_op<>'DELETE' then
  if (new.organizer_id,new.unit_id,new.offering_id) is distinct from (p.organizer_id,p.unit_id,p.offering_id) then
   raise exception 'Ogiltig APL-koppling till skola och utbildning.' using errcode='42501';end if;
  if tg_op='UPDATE' and new.created_at is distinct from old.created_at then raise exception 'APL-ursprung är låst.' using errcode='42501';end if;
 elsif tg_table_name='apl_period_contents' and tg_op<>'DELETE' then
  if not exists(select 1 from jsonb_array_elements(p.gym_basis->'rows') r where r->>'key'=new.row_key) then
   raise exception 'Innehållet saknas i fryst programkälla.' using errcode='22023',hint='unknown_content';end if;
 elsif tg_table_name='apl_rector_confirmations' then
  a:=public.phase5_programplan_actor();
  if a.function<>'rektor' or new.unit_id<>p.unit_id or new.actor_id<>public.current_identity_id() or new.assignment_id<>a.id or new.revision<>p.revision then
   raise exception 'Bekräftelsen kräver rektors aktuella mandat.' using errcode='42501';end if;
 elsif tg_table_name='apl_plan_copy_reviews' then
  if tg_op='DELETE' then raise exception 'Kopieringsunderlag får inte raderas.' using errcode='42501';end if;
  if tg_op='INSERT' then
   if not exists(select 1 from public.timplans source where source.id=new.source_plan_id and source.version=new.source_version
     and (source.organizer_id,source.unit_id,source.offering_id)=(p.organizer_id,p.unit_id,p.offering_id))
    or new.resolved_at is not null or not public.phase5_apl_text(to_jsonb(new.source_period_name),120) then
    raise exception 'Ogiltigt ursprung för kopieringsgranskningen.' using errcode='42501';end if;
   perform public.phase5_apl_plan_parse(jsonb_build_object('contractVersion','structured_v1','educationForm','unknown','classification','unreviewed',
    'periods',jsonb_build_array(jsonb_build_object('id',new.source_period_id,'name',new.source_period_name,'startsOn',null,'endsOn',null,'schoolYear',null,
    'extent',jsonb_build_object('basis','unknown','weeks',null,'reviewed',false,'reviewNote',''),'contents',new.contents,'allocations',new.allocations))));
  end if;
  if tg_op='UPDATE' then
   if old.resolved_at is not null or new.resolved_at is null
   or (to_jsonb(new)-array['resolved_actor_id','resolved_assignment_id','resolved_at','resolution_note'])
    is distinct from (to_jsonb(old)-array['resolved_actor_id','resolved_assignment_id','resolved_at','resolution_note']) then
    raise exception 'Kopieringsunderlaget är oföränderligt.' using errcode='42501';end if;
   a:=public.phase5_programplan_actor();
   if new.resolved_actor_id<>public.current_identity_id() or new.resolved_assignment_id<>a.id then
    raise exception 'Granskningsansvar saknar aktuellt mandat.' using errcode='42501';end if;
  end if;
 end if;
 return case when tg_op='DELETE' then old else new end;
end $$;
do $$declare n text;begin
 foreach n in array array['apl_plan_underlag','apl_plan_periods','apl_period_contents','apl_time_allocations','apl_plan_copy_reviews','apl_rector_confirmations','apl_plan_commands'] loop
  execute format('create trigger %I before insert or update or delete on public.%I for each row execute function public.phase5_apl_write_guard()',n||'_guard',n);
  execute format('create trigger %I before truncate on public.%I for each statement execute function public.phase5_apl_write_guard()',n||'_no_truncate',n);
 end loop;
end $$;

-- Shares the existing timplan row lock. This also protects a later ordinary
-- total-hours edit; an APL subset may never survive above a lowered/null total.
create function public.phase5_apl_timplan_cells_guard() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
declare pid uuid;rowkey text;allocation record;
begin
 pid:=old.timplan_id;rowkey:=old.row_id;
 if exists(select 1 from public.apl_time_allocations a where a.plan_id=pid and a.row_key=rowkey) then
  perform 1 from public.timplans where id=pid for update;
  for allocation in select a.term_index,sum(a.gut_minutes)::bigint minutes from public.apl_time_allocations a
   where a.plan_id=pid and a.row_key=rowkey group by a.term_index loop
   if tg_op='DELETE' then
    raise exception 'Justera först APL-fördelningen innan totaltiden tas bort.' using errcode='22023',hint='allocation_without_total';end if;
   if (new.timplan_id,new.row_id) is distinct from (old.timplan_id,old.row_id) or not coalesce(new.allocated[allocation.term_index+1],false) then
    raise exception 'Justera först APL-fördelningen innan totaltiden tas bort.' using errcode='22023',hint='allocation_without_total';end if;
   if allocation.minutes>new.hours[allocation.term_index+1]::bigint*60 then
    raise exception 'Totaltiden är mindre än APL-andelen. Justera först APL-fördelningen.' using errcode='22023',hint='allocation_exceeds_total';end if;
  end loop;
 end if;
 return case when tg_op='DELETE' then old else new end;
end $$;
create trigger timplan_cells_apl_guard before update or delete on public.timplan_cells
 for each row execute function public.phase5_apl_timplan_cells_guard();

create function public.phase5_apl_plan_scope(target_plan uuid,writing boolean default false) returns public.timplans
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare p public.timplans;
begin
 select * into p from public.timplans where id=target_plan;
 if p.id is null or p.gym_basis is null then raise exception 'APL-underlaget är inte tillgängligt.' using errcode='42501';end if;
 perform public.phase5_gym_timplan_scope(p.offering_id,p.unit_id,writing);
 perform 1 from public.point_plans where id=p.source_programplan_id for update;
 perform 1 from public.timplan_series where id=p.series_id for update;
 select * into p from public.timplans where id=target_plan for update;
 perform public.phase5_gym_timplan_scope(p.offering_id,p.unit_id,writing);
 if writing and p.status not in ('utkast','atersand') then raise exception 'APL-underlaget är låst för beslut.' using errcode='42501';end if;
 return p;
end $$;

create function public.phase5_apl_plan_value(target_plan uuid) returns jsonb
language sql stable security definer set search_path=pg_catalog,public as $$
 select jsonb_build_object('contractVersion',u.contract_version,'educationForm',u.education_form,'classification',u.classification,
 'periods',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'startsOn',to_char(p.starts_on,'YYYY-MM-DD'),'endsOn',to_char(p.ends_on,'YYYY-MM-DD'),
 'schoolYear',p.school_year,'extent',jsonb_build_object('basis',p.extent_basis,'weeks',p.whole_weeks,'reviewed',p.reviewed,'reviewNote',p.review_note),
 'contents',coalesce((select jsonb_agg(jsonb_build_object('rowKey',c.row_key,'description',c.description) order by c.row_key collate "C") from public.apl_period_contents c where c.plan_id=p.plan_id and c.period_id=p.id),'[]'),
 'allocations',coalesce((select jsonb_agg(jsonb_build_object('rowKey',a.row_key,'termIndex',a.term_index,'gutMinutes',a.gut_minutes) order by a.row_key collate "C",a.term_index) from public.apl_time_allocations a where a.plan_id=p.plan_id and a.period_id=p.id),'[]')) order by p.id)
 from public.apl_plan_periods p where p.plan_id=u.plan_id),'[]')) from public.apl_plan_underlag u where u.plan_id=target_plan
$$;

create function public.phase5_apl_copy_review(target_plan uuid) returns jsonb
language sql stable security definer set search_path=pg_catalog,public as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'sourcePlanId',r.source_plan_id,'sourceVersion',r.source_version,
 'sourcePeriodId',r.source_period_id,'sourcePeriodName',r.source_period_name,'reason',r.reason,'contents',r.contents,'allocations',r.allocations,
 'resolution',case when r.resolved_at is null then null else jsonb_build_object('actorId',r.resolved_actor_id,'assignmentId',r.resolved_assignment_id,
 'at',to_char(r.resolved_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'note',r.resolution_note) end) order by r.id),'[]')
 from public.apl_plan_copy_reviews r where r.plan_id=target_plan
$$;

create function public.phase5_apl_program(gym jsonb) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare program jsonb;supported boolean;
begin
 select value into program from jsonb_array_elements(gym#>'{catalog,programs}')
 where value->>'code'=gym#>>'{source,basisReference,programRef,code}' and value->'version'=gym#>'{source,basisReference,programRef,version}';
 if program is null then raise exception 'APL-källans program kan inte verifieras.' using errcode='22023',hint='invalid_apl_plan';end if;
 supported:=jsonb_array_length(public.phase5_plan_decision_source_blockers((gym->'source')||jsonb_build_object('status','utkast','archived',false)))=0;
 return jsonb_build_object('code',program->'code','version',program->'version','category',program->'category',
  'startDate',program->'startDate','endDate',program->'endDate','canceledDate',program->'canceledDate','sourceSupported',supported);
end $$;

-- Pure canonical hashing and validation helpers follow below.
-- APL-01 portable hash contract. These are private helpers, not RPC entry points.
-- Input structures must already have passed the APL/source/matrix validators.
-- JSON object formatting is never used as hash input.
create function public.phase5_apl_canonical(value jsonb) returns text
language plpgsql immutable security definer set search_path=pg_catalog,public as $$
declare kind text; result_text text; element jsonb; scalar_text text; scalar_number numeric;
begin
 if value is null then raise exception 'APL canonical SQL null is not a JSON value' using errcode='22023',hint='apl_invalid_contract';end if;
 kind:=jsonb_typeof(value);
 if kind='null' then return 'n';end if;
 if kind='boolean' then return case when value='true'::jsonb then 't' else 'f' end;end if;
 if kind='number' then
  scalar_number:=(value#>>'{}')::numeric;
  if trunc(scalar_number)<>scalar_number or abs(scalar_number)>9007199254740991 then
   raise exception 'APL canonical number must be a safe integer' using errcode='22023',hint='apl_invalid_contract';
  end if;
  return 'i'||scalar_number::bigint::text||';';
 end if;
 if kind='string' then
  scalar_text:=value#>>'{}';
  return 's'||octet_length(convert_to(scalar_text,'UTF8'))::text||':'||scalar_text;
 end if;
 if kind='array' then
  if jsonb_array_length(value)>200000 then raise exception 'APL canonical array too large' using errcode='22023',hint='apl_invalid_contract';end if;
  result_text:='a'||jsonb_array_length(value)::text||':';
  for element in select item.value from jsonb_array_elements(value) with ordinality item(value,position) order by item.position loop
   result_text:=result_text||public.phase5_apl_canonical(element);
  end loop;
  return result_text;
 end if;
 raise exception 'APL canonical objects are unsupported' using errcode='22023',hint='apl_invalid_contract';
end $$;

create function public.phase5_apl_hash_payload(gym jsonb,organizer uuid,apl jsonb,reviews jsonb,program jsonb) returns jsonb
language plpgsql immutable security definer set search_path=pg_catalog,public as $$
declare source_data jsonb:=gym->'source'; basis_data jsonb:=gym->'source'->'basisReference';
 row_data jsonb; row_key text; row_part text; row_kind text; block_kind text; block_count integer;
 row_terms jsonb; row_hours jsonb; rows_payload jsonb:='[]'::jsonb;
 apl_payload jsonb:='null'::jsonb; period_data jsonb; periods_payload jsonb:='[]'::jsonb;
 contents_payload jsonb; allocations_payload jsonb; review_data jsonb; reviews_payload jsonb:='[]'::jsonb;
 resolution_payload jsonb;
begin
 if organizer is null or jsonb_typeof(gym) is distinct from 'object'
  or jsonb_typeof(source_data->'rows') is distinct from 'array'
  or jsonb_typeof(source_data->'distribution') is distinct from 'array'
  or jsonb_typeof(basis_data) is distinct from 'object'
  or jsonb_typeof(reviews) is distinct from 'array'
  or jsonb_typeof(program) is distinct from 'object' then
  raise exception 'APL hash context missing' using errcode='22023',hint='apl_invalid_contract';
 end if;
 -- projectGymTimplan derives these attributes from the verified source's exact
 -- catalog/rows. Raw source.rows contains key+points, not the UI rowKind/part.
 for row_data in select item.value from jsonb_array_elements(source_data->'rows') item(value)
  order by (item.value->>'key') collate "C" loop
  row_key:=row_data->>'key';
  if row_key like 'block:%' then
   row_kind:='block';
   select count(*),min(item.value->>'kind') into block_count,block_kind
    from jsonb_array_elements(coalesce(basis_data->'choiceBlocks','[]'::jsonb)) item(value)
    where item.value->>'id'=substr(row_key,7);
   if block_count<>1 then raise exception 'APL hash block does not match frozen source' using errcode='22023',hint='apl_invalid_contract';end if;
   row_part:=case block_kind when 'modernLanguage' then 'programmeSpecific' when 'languageSubject' then 'orientation'
    when 'naturalScience' then 'orientation' when 'specialization' then 'specialization' when 'individualChoice' then 'individualChoice' else null end;
  elsif row_key like 'alternative:%' then row_kind:='alternative';row_part:=split_part(row_key,':',2);
  elsif row_key='meta:diplomaWork' then row_kind:='diplomaWork';row_part:='diplomaWork';
  elsif row_key='meta:individualChoice' then
   -- Exactly matches the legacy GymTimplan projection. APL readiness still
   -- rejects this unspecified frame as verified subject-level content.
   row_kind:='fixed';row_part:='individualChoice';
  else row_kind:='fixed';row_part:=split_part(row_key,':',1);end if;
  if row_part is null or row_part not in ('foundation','programmeSpecific','orientation','specialization','individualChoice','diplomaWork') then
   raise exception 'APL hash row part invalid' using errcode='22023',hint='apl_invalid_contract';
  end if;
  select item.value->'points' into row_terms from jsonb_array_elements(source_data->'distribution') item(value)
   where item.value->>'rowKey'=row_key;
  row_terms:=coalesce(row_terms,'[0,0,0,0,0,0]'::jsonb);
  row_hours:=gym->'hours'->row_key;
  if jsonb_typeof(row_terms) is distinct from 'array' or jsonb_array_length(row_terms)<>6
   or jsonb_typeof(row_hours) is distinct from 'array' or jsonb_array_length(row_hours)<>6 then
   raise exception 'APL hash term matrix missing' using errcode='22023',hint='apl_invalid_contract';
  end if;
  rows_payload:=rows_payload||jsonb_build_array(jsonb_build_array(row_key,row_data->'points',row_part,row_kind,row_terms,row_hours));
 end loop;

 if apl is not null and apl<>'null'::jsonb then
  for period_data in select item.value from jsonb_array_elements(apl->'periods') item(value)
   order by (item.value->>'id') collate "C" loop
   select coalesce(jsonb_agg(jsonb_build_array(item.value->'rowKey',item.value->'description')
    order by (item.value->>'rowKey') collate "C"),'[]'::jsonb) into contents_payload
    from jsonb_array_elements(period_data->'contents') item(value);
   select coalesce(jsonb_agg(jsonb_build_array(item.value->'rowKey',item.value->'termIndex',item.value->'gutMinutes')
    order by (item.value->>'rowKey') collate "C",(item.value->>'termIndex')::integer),'[]'::jsonb) into allocations_payload
    from jsonb_array_elements(period_data->'allocations') item(value);
   periods_payload:=periods_payload||jsonb_build_array(jsonb_build_array(
    period_data->'id',period_data->'name',period_data->'startsOn',period_data->'endsOn',period_data->'schoolYear',
    jsonb_build_array(period_data->'extent'->'basis',period_data->'extent'->'weeks',period_data->'extent'->'reviewed',period_data->'extent'->'reviewNote'),
    contents_payload,allocations_payload));
  end loop;
  apl_payload:=jsonb_build_array(apl->'contractVersion',apl->'educationForm',apl->'classification',periods_payload);
 end if;

 for review_data in select item.value from jsonb_array_elements(reviews) item(value)
  order by (item.value->>'id') collate "C" loop
  select coalesce(jsonb_agg(jsonb_build_array(item.value->'rowKey',item.value->'description')
   order by (item.value->>'rowKey') collate "C"),'[]'::jsonb) into contents_payload
   from jsonb_array_elements(review_data->'contents') item(value);
  select coalesce(jsonb_agg(jsonb_build_array(item.value->'rowKey',item.value->'termIndex',item.value->'gutMinutes')
   order by (item.value->>'rowKey') collate "C",(item.value->>'termIndex')::integer),'[]'::jsonb) into allocations_payload
   from jsonb_array_elements(review_data->'allocations') item(value);
  resolution_payload:=case when review_data->'resolution' is null or review_data->'resolution'='null'::jsonb then 'null'::jsonb
   else jsonb_build_array(review_data->'resolution'->'actorId',review_data->'resolution'->'assignmentId',review_data->'resolution'->'at',review_data->'resolution'->'note') end;
  reviews_payload:=reviews_payload||jsonb_build_array(jsonb_build_array(review_data->'id',review_data->'sourcePlanId',review_data->'sourceVersion',
   review_data->'sourcePeriodId',review_data->'sourcePeriodName',review_data->'reason',contents_payload,allocations_payload,resolution_payload));
 end loop;

 return jsonb_build_array('apl_content_v1',
  jsonb_build_array(organizer::text,gym->'unitId',gym->'offeringId',gym->'id',gym->'series'->'id',gym->'version'),
  jsonb_build_array(source_data->'planId',source_data->'version',source_data->'catalogId',basis_data->'startedOn',
   source_data->'education'->'programCode',source_data->'education'->'orientationCode',program->'version',program->'category',
   program->'startDate',program->'endDate',program->'canceledDate',program->'sourceSupported'),
  rows_payload,apl_payload,reviews_payload);
end $$;

create function public.phase5_apl_hash_value(gym jsonb,organizer uuid,apl jsonb,reviews jsonb,program jsonb) returns text
language sql immutable security definer set search_path=pg_catalog,public as $$
 select 'sha256:'||encode(sha256(convert_to(public.phase5_apl_canonical(
  public.phase5_apl_hash_payload(gym,organizer,apl,reviews,program)),'UTF8')),'hex')
$$;

revoke all on function public.phase5_apl_canonical(jsonb),public.phase5_apl_hash_payload(jsonb,uuid,jsonb,jsonb,jsonb),
 public.phase5_apl_hash_value(jsonb,uuid,jsonb,jsonb,jsonb)
 from public,anon,authenticated,service_role,skolplattform_worker;

create function public.phase5_apl_content_hash(target_plan uuid) returns text
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare p public.timplans;gym jsonb;
begin
 select * into p from public.timplans where id=target_plan;
 gym:=public.phase5_gym_timplan_result(target_plan);
 return public.phase5_apl_hash_value(gym,p.organizer_id,public.phase5_apl_plan_value(target_plan),public.phase5_apl_copy_review(target_plan),public.phase5_apl_program(gym));
end $$;

create function public.phase5_apl_plan_basis(target_plan uuid) returns jsonb
language sql volatile security definer set search_path=pg_catalog,public as $$
 select jsonb_build_object('organizerId',p.organizer_id,'gymTimplan',public.phase5_gym_timplan_result(p.id),'copyReview',public.phase5_apl_copy_review(p.id))
 from public.timplans p where p.id=target_plan
$$;

create function public.phase5_apl_plan_projection(target_plan uuid) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare p public.timplans;a public.access_assignments;gym jsonb;plan jsonb;reviews jsonb;program jsonb;history jsonb;editable boolean;
begin
 select * into p from public.timplans where id=target_plan;
 a:=public.phase5_programplan_actor();gym:=public.phase5_gym_timplan_result(p.id);
 plan:=public.phase5_apl_plan_value(p.id);reviews:=public.phase5_apl_copy_review(p.id);program:=public.phase5_apl_program(gym);
 if plan is not null then
  plan:=public.phase5_apl_plan_parse(plan);perform public.phase5_apl_validate_allocations(gym,plan);
 end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'planId',e.plan_id,'unitId',e.unit_id,'actorId',e.actor_id,'assignmentId',e.assignment_id,
  'actorName',e.actor_name,'at',to_char(e.occurred_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  'revision',e.revision,'contentHash',e.content_hash,'comment',e.comment) order by e.revision),'[]') into history
 from public.apl_rector_confirmations e where e.plan_id=p.id;
 editable:=p.status in ('utkast','atersand') and gym->'archived'='false'::jsonb;
 return jsonb_build_object('contractVersion','structured_v1','planId',p.id,'revision',p.revision,'organizerId',p.organizer_id,
  'program',program,'plan',plan,'copyReview',reviews,'contentHash',public.phase5_apl_hash_value(gym,p.organizer_id,plan,reviews,program),
  'confirmations',history,'capabilities',jsonb_build_object('canSave',editable and a.function in ('rektor','administrator'),'canConfirm',editable and a.function='rektor'));
end $$;

create function public.phase5_apl_plan_audit(target_plan uuid,operation text) returns void
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare a public.access_assignments;s public.app_sessions;i public.identities;
begin
 if target_plan is null or operation is null or operation not in ('apl_plan_read','apl_plan_status_read','apl_plan_saved','apl_plan_unchanged','apl_placement_confirmed') then
  raise exception 'Ogiltig APL-loggning.' using errcode='22023';end if;
 a:=public.phase5_programplan_actor();s:=public.phase5_programplan_session_check();select * into i from public.identities where id=s.identity_id;
 begin
  insert into public.security_events(correlation_id,source,actor_identity_id,actor_issuer,actor_subject,session_id,membership_id,assignment_id,customer_id,action,object_type,object_id,outcome,details)
  values(nullif(current_setting('app.correlation_id',true),'')::uuid,'db',i.id,i.issuer,i.subject,s.id,a.membership_id,a.id,a.customer_id,operation,'timplan',target_plan,'ok','{}');
 exception when others then raise exception 'APL-loggningen är inte tillgänglig.' using errcode='55000';end;
end $$;

create function public.phase5_apl_plan_read(target_plan uuid) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare p public.timplans;result jsonb;
begin
 p:=public.phase5_apl_plan_scope(target_plan,false);
 result:=jsonb_build_object('contractVersion','apl_sql_v1','basis',public.phase5_apl_plan_basis(p.id),'result',public.phase5_apl_plan_projection(p.id));
 perform public.phase5_apl_plan_audit(p.id,'apl_plan_read');return result;
end $$;

create function public.phase5_apl_plan_command(input jsonb) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare q jsonb;target_plan uuid;request_id uuid;p public.timplans;a public.access_assignments;s public.app_sessions;r public.apl_plan_commands;
 gym jsonb;previous jsonb;next_plan jsonb;reviews jsonb;program jsonb;content_hash text;next_hash text;changed boolean;receipt jsonb;detail jsonb;envelope jsonb;
 period jsonb;content jsonb;allocation jsonb;resolution jsonb;confirmation_id uuid;now_at timestamptz;actor_name text;blockers jsonb;action_name text;
begin
 q:=public.phase5_apl_plan_request(input);target_plan:=(q->>'planId')::uuid;request_id:=(q->>'commandId')::uuid;
 p:=public.phase5_apl_plan_scope(target_plan,false);a:=public.phase5_programplan_actor();s:=public.phase5_programplan_session_check();
 if a.function not in ('rektor','administrator') or (q->>'action'='confirm' and a.function<>'rektor') then
  raise exception 'APL-åtgärden kräver aktuellt skolmandat.' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(request_id::text,5541));
 select * into r from public.apl_plan_commands where command_id=request_id;
 if found then
  if (r.plan_id,r.organizer_id,r.unit_id,r.actor_identity_id,r.assignment_id,r.action,r.request)
    is distinct from (p.id,p.organizer_id,p.unit_id,s.identity_id,a.id,q->>'action',q) then
   raise exception 'APL-kommandot har ändrats.' using errcode='40001',hint='apl_command_conflict';end if;
  return jsonb_set(r.envelope,'{result,receipt,replayed}','true'::jsonb,false);
 end if;
 p:=public.phase5_apl_plan_scope(target_plan,true);
 if p.revision<>(q->>'expectedRevision')::integer then raise exception 'APL-underlaget har ändrats. Läs in det igen.' using errcode='40001',hint='apl_revision_conflict';end if;
 gym:=public.phase5_gym_timplan_result(p.id);previous:=public.phase5_apl_plan_value(p.id);reviews:=public.phase5_apl_copy_review(p.id);program:=public.phase5_apl_program(gym);
 content_hash:=public.phase5_apl_hash_value(gym,p.organizer_id,previous,reviews,program);
 insert into public.apl_plan_write_permits values(txid_current(),pg_backend_pid(),p.id);
 now_at:=date_trunc('milliseconds',clock_timestamp());
 if q->>'action'='save' then
  next_plan:=q->'plan';perform public.phase5_apl_validate_allocations(gym,next_plan);
  for resolution in select value from jsonb_array_elements(q->'copyReviewResolutions') loop
   if not exists(select 1 from public.apl_plan_copy_reviews c where c.id=(resolution->>'id')::uuid and c.plan_id=p.id and c.resolved_at is null) then
    raise exception 'Granskningspunkten finns inte eller är redan hanterad. Läs in APL-underlaget igen.' using errcode='22023',hint='invalid_copy_review_resolution';end if;
  end loop;
  next_hash:=public.phase5_apl_hash_value(gym,p.organizer_id,next_plan,reviews,program);
  changed:=next_hash<>content_hash or jsonb_array_length(q->'copyReviewResolutions')>0;
  if changed then
   insert into public.apl_plan_underlag(plan_id,organizer_id,unit_id,offering_id,education_form,classification,created_at,updated_at)
   values(p.id,p.organizer_id,p.unit_id,p.offering_id,next_plan->>'educationForm',next_plan->>'classification',now_at,now_at)
   on conflict(plan_id) do update set education_form=excluded.education_form,classification=excluded.classification,updated_at=excluded.updated_at;
   delete from public.apl_plan_periods where plan_id=p.id;
   for period in select value from jsonb_array_elements(next_plan->'periods') loop
    insert into public.apl_plan_periods(id,plan_id,name,starts_on,ends_on,school_year,extent_basis,whole_weeks,reviewed,review_note)
    values((period->>'id')::uuid,p.id,period->>'name',(period->>'startsOn')::date,(period->>'endsOn')::date,(period->>'schoolYear')::integer,
     period#>>'{extent,basis}',(period#>>'{extent,weeks}')::integer,(period#>>'{extent,reviewed}')::boolean,period#>>'{extent,reviewNote}');
    for content in select value from jsonb_array_elements(period->'contents') loop
     insert into public.apl_period_contents(plan_id,period_id,row_key,description) values(p.id,(period->>'id')::uuid,content->>'rowKey',content->>'description');
    end loop;
    for allocation in select value from jsonb_array_elements(period->'allocations') loop
     insert into public.apl_time_allocations(plan_id,period_id,row_key,term_index,gut_minutes)
     values(p.id,(period->>'id')::uuid,allocation->>'rowKey',(allocation->>'termIndex')::integer,(allocation->>'gutMinutes')::integer);
    end loop;
   end loop;
   for resolution in select value from jsonb_array_elements(q->'copyReviewResolutions') loop
    update public.apl_plan_copy_reviews set resolved_actor_id=s.identity_id,resolved_assignment_id=a.id,resolved_at=now_at,resolution_note=resolution->>'note'
    where id=(resolution->>'id')::uuid and plan_id=p.id and resolved_at is null;
   end loop;
   update public.timplans set revision=revision+1 where id=p.id returning * into p;
  end if;
  action_name:=case when changed then 'apl_plan_saved' else 'apl_plan_unchanged' end;
 else
  if content_hash<>q->>'expectedContentHash' then raise exception 'APL-innehållet har ändrats. Granska det igen.' using errcode='40001',hint='apl_content_conflict';end if;
  blockers:=public.phase5_apl_confirmation_blockers(gym,previous,reviews,program);
  if jsonb_array_length(blockers)>0 then raise exception 'APL-underlaget behöver kompletteras innan förläggningen kan bekräftas.' using errcode='40001',hint='apl_confirmation_blocked',detail=blockers::text;end if;
  if (select count(*) from public.apl_rector_confirmations e where e.plan_id=p.id)>=1000 then
   raise exception 'Skapa en ny timplansversion för fortsatt granskning.' using errcode='40001',hint='apl_confirmation_limit';end if;
  select i.display_name into actor_name from public.identities i where i.id=s.identity_id;
  if not public.phase5_apl_text(to_jsonb(actor_name),200,false) then actor_name:='Rektor';end if;
  changed:=true;confirmation_id:=gen_random_uuid();
  update public.timplans set revision=revision+1 where id=p.id returning * into p;
  insert into public.apl_rector_confirmations(id,plan_id,unit_id,actor_id,assignment_id,actor_name,occurred_at,revision,content_hash,comment)
  values(confirmation_id,p.id,p.unit_id,s.identity_id,a.id,actor_name,now_at,p.revision,content_hash,q->>'comment');
  action_name:='apl_placement_confirmed';
 end if;
 detail:=public.phase5_apl_plan_projection(p.id);
 receipt:=jsonb_build_object('contractVersion','structured_v1','commandId',request_id,'planId',p.id,'action',q->>'action','revision',p.revision,
  'changed',changed,'replayed',false,'contentHash',detail->'contentHash','confirmationId',confirmation_id);
 envelope:=jsonb_build_object('contractVersion','apl_sql_v1','basis',public.phase5_apl_plan_basis(p.id),'result',jsonb_build_object('receipt',receipt,'detail',detail));
 insert into public.apl_plan_commands(command_id,plan_id,organizer_id,unit_id,actor_identity_id,assignment_id,action,request,envelope)
 values(request_id,p.id,p.organizer_id,p.unit_id,s.identity_id,a.id,q->>'action',q,envelope);
 perform public.phase5_apl_plan_audit(p.id,action_name);
 delete from public.apl_plan_write_permits where transaction_id=txid_current() and backend_id=pg_backend_pid() and plan_id=p.id;
 return envelope;
end $$;

create function public.phase5_apl_plan_status(input jsonb) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare q jsonb;p public.timplans;a public.access_assignments;s public.app_sessions;r public.apl_plan_commands;result jsonb;
begin
 if not public.phase5_programplan_shape(input,array['command']) then raise exception 'Ogiltig APL-statusfråga.' using errcode='22023',hint='invalid_apl_plan';end if;
 q:=public.phase5_apl_plan_request(input->'command');p:=public.phase5_apl_plan_scope((q->>'planId')::uuid,false);
 a:=public.phase5_programplan_actor();s:=public.phase5_programplan_session_check();
 if a.function not in ('rektor','administrator') or (q->>'action'='confirm' and a.function<>'rektor') then raise exception 'APL-status kräver aktuellt skolmandat.' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(q->>'commandId',5541));
 select * into r from public.apl_plan_commands where command_id=(q->>'commandId')::uuid;
 if r.command_id is null then
  result:=jsonb_build_object('contractVersion','apl_sql_v1','basis',null,'result',jsonb_build_object('state','not_found','result',null));
 else
  if (r.plan_id,r.organizer_id,r.unit_id,r.actor_identity_id,r.assignment_id,r.action,r.request)
    is distinct from (p.id,p.organizer_id,p.unit_id,s.identity_id,a.id,q->>'action',q) then
   raise exception 'APL-kommandot har ändrats.' using errcode='40001',hint='apl_command_conflict';end if;
  result:=jsonb_build_object('contractVersion','apl_sql_v1','basis',r.envelope->'basis','result',jsonb_build_object('state','completed',
   'result',jsonb_set(r.envelope->'result','{receipt,replayed}','true'::jsonb,false)));
 end if;
 perform public.phase5_apl_plan_audit(p.id,'apl_plan_status_read');return result;
end $$;

-- All new entry points remain closed until the separately verified API grant.
do $$declare fn record;begin
 for fn in select oid::regprocedure::text signature from pg_proc where pronamespace='public'::regnamespace and proname like 'phase5_apl_%' loop
  execute 'revoke all on function '||fn.signature||' from public,anon,authenticated,service_role,skolplattform_worker';
 end loop;
end $$;
-- APL-01 parity helpers. Inputs are validated frozen raw GymTimplan/AplPlan values.
-- No table reads, current-date assumptions, or authorization decisions occur here.
create function public.phase5_apl_allocation_issues(gym jsonb, apl jsonb) returns jsonb
language plpgsql immutable security definer set search_path=pg_catalog,public as $$
declare
 rows_by_key jsonb; points_by_key jsonb; period jsonb; allocation jsonb; cell jsonb;
 row_key text; term_index integer; total_hours integer; cell_key text;
 cell_totals jsonb:='{}'::jsonb; cell_order jsonb:='[]'::jsonb; issues jsonb:='[]'::jsonb;
begin
 select coalesce(jsonb_object_agg(r->>'key',r),'{}'::jsonb) into rows_by_key
 from jsonb_array_elements(gym#>'{source,rows}') r;
 select coalesce(jsonb_object_agg(d->>'rowKey',d->'points'),'{}'::jsonb) into points_by_key
 from jsonb_array_elements(gym#>'{source,distribution}') d;
 for period in select value from jsonb_array_elements(apl->'periods') loop
  for allocation in select value from jsonb_array_elements(period->'allocations') loop
   row_key:=allocation->>'rowKey';term_index:=(allocation->>'termIndex')::integer;
   if not rows_by_key ? row_key then
    issues:=issues||jsonb_build_array(jsonb_build_object('code','unknown_content',
     'message','Tiden avser innehåll som saknas i den här frysta programkällan. Fördelningen behöver rättas.'));
    continue;
   end if;
   if (points_by_key->row_key->>term_index)::integer=0 then
    issues:=issues||jsonb_build_array(jsonb_build_object('code','inactive_term',
     'message','APL-tid får bara fördelas på en termin där innehållet ingår.'));
    continue;
   end if;
   total_hours:=(gym->'hours'->row_key->>term_index)::integer;
   if total_hours is null then
    issues:=issues||jsonb_build_array(jsonb_build_object('code','allocation_without_total',
     'message','Fördela först totaltimmarna i timplanen. APL ingår i dessa timmar.'));
   end if;
   -- JSON array serialization is an injective private map key, not the content-hash protocol.
   cell_key:=jsonb_build_array(row_key,term_index)::text;
   if not cell_totals ? cell_key then
    cell_order:=cell_order||jsonb_build_array(jsonb_build_object('key',cell_key,'rowKey',row_key,'termIndex',term_index));
   end if;
   cell_totals:=jsonb_set(cell_totals,array[cell_key],to_jsonb(coalesce((cell_totals->>cell_key)::bigint,0)+(allocation->>'gutMinutes')::bigint),true);
  end loop;
 end loop;
 -- Preserve Map insertion order: allocation-level problems precede aggregate cell problems.
 for cell in select value from jsonb_array_elements(cell_order) loop
  total_hours:=(gym->'hours'->(cell->>'rowKey')->>((cell->>'termIndex')::integer))::integer;
  if total_hours is not null and (cell_totals->>(cell->>'key'))::bigint>total_hours::bigint*60 then
   issues:=issues||jsonb_build_array(jsonb_build_object('code','allocation_exceeds_total',
    'message','APL-andelen överstiger sparad total tid. Justera APL-fördelningen eller totaltimmarna innan du sparar.'));
  end if;
 end loop;
 return issues;
end $$;

create function public.phase5_apl_validate_allocations(gym jsonb, apl jsonb) returns void
language plpgsql immutable security definer set search_path=pg_catalog,public as $$
declare first_issue jsonb;
begin
 if exists(
  select 1 from jsonb_array_elements(apl->'periods') p
  cross join lateral jsonb_array_elements(p->'contents') c
  where not exists(select 1 from jsonb_array_elements(gym#>'{source,rows}') r where r->>'key'=c->>'rowKey')
 ) then
  raise exception 'Innehållskopplingen saknas i den här frysta programkällan. Välj befintligt innehåll innan du sparar.'
   using errcode='22023',hint='unknown_content';
 end if;
 first_issue:=public.phase5_apl_allocation_issues(gym,apl)->0;
 if first_issue is not null then
  raise exception '%',first_issue->>'message' using errcode='22023',hint=first_issue->>'code';
 end if;
end $$;

create function public.phase5_apl_confirmation_blockers(gym jsonb, apl jsonb, reviews jsonb, program jsonb) returns jsonb
language plpgsql immutable security definer set search_path=pg_catalog,public as $$
declare
 blockers jsonb:='[]'::jsonb; rows_by_key jsonb; period jsonb; content jsonb; allocation jsonb; issue jsonb;
 started date; first_date date; last_date date; start_year integer; period_year integer; year integer; idx integer;
 term_starts date[]:='{}'::date[]; term_ends date[]:='{}'::date[]; term_indices integer[];
 supported boolean; complete_dates boolean; periods_overlap boolean:=false; capacity_conflict boolean:=false;
 weeks integer; reviewed_weeks integer:=0; reviewed_known boolean:=true; expected_minutes bigint; allocated_minutes bigint;
 first_week integer; last_week integer; candidate integer; occupied_end integer; n integer; overlap_count integer;
 -- PG17 is the configured target. Merged integer ranges implement the same earliest-free-week
 -- set as TS, without a date-span loop or quadratic scan over up to 16,000 assigned weeks.
 used_weeks int4multirange:='{}'::int4multirange; interval_row record;
begin
 if apl is null or apl='null'::jsonb then
  return jsonb_build_array('Planen saknar strukturerat APL-underlag. Befintliga timmar har ännu ingen granskad APL-fördelning.');
 end if;
 started:=(gym#>>'{source,basisReference,startedOn}')::date;
 supported:=coalesce(apl->>'educationForm'='school_based' and (program->>'sourceSupported')::boolean
  and program->>'category'='VOCATIONAL_PROGRAM'
  and program->>'code'=any(array['BA25','BF25','EE25','FR25','FS25','FT25','HT25','IN25','NB25','RL25','VF25','VO25'])
  and started is not null and started>=date '2025-07-01' and started<date '2028-07-02'
  and program->>'startDate' is not null and started>=(program->>'startDate')::date
  and (program->>'endDate' is null or started<=(program->>'endDate')::date)
  and (program->>'canceledDate' is null or started<(program->>'canceledDate')::date),false);
 if apl->>'educationForm'='unknown' then
  blockers:=blockers||jsonb_build_array('Välj utbildningsform innan omfattningen granskas.');
 elsif apl->>'educationForm'='apprenticeship' then
  blockers:=blockers||jsonb_build_array('Lärlingsutbildning kräver en annan beräkningsgrund som inte stöds i denna etapp.');
 elsif not supported then
  blockers:=blockers||jsonb_build_array('APL-reglerna är inte verifierade för den här frysta programkällan och elevkullen.');
 end if;
 if apl->>'classification'<>'complete' then
  blockers:=blockers||jsonb_build_array('Granska hur den befintliga totaltiden fördelas mellan APL och skolförlagd undervisning.');
 end if;
 if exists(select 1 from jsonb_array_elements(reviews) r where r->'resolution'='null'::jsonb) then
  blockers:=blockers||jsonb_build_array('Kopieringen innehåller tid eller innehåll som inte kunde överföras till den nya källan. Granska varje bevarad punkt och dokumentera hur den har hanterats.');
 end if;
 if jsonb_array_length(apl->'periods')=0 then blockers:=blockers||jsonb_build_array('Lägg till planerade APL-perioder.');end if;
 if exists(
  select 1 from jsonb_array_elements(gym#>'{source,rows}') r
  join jsonb_array_elements(gym#>'{source,distribution}') d on d->>'rowKey'=r->>'key'
  cross join generate_series(0,5) i
  where (d->'points'->>i)::integer<>0 and gym->'hours'->(r->>'key')->>i is null
 ) then blockers:=blockers||jsonb_build_array('Timplanen saknar totaltimmar i ett eller flera aktiva terminsfält.');end if;
 for issue in select value from jsonb_array_elements(public.phase5_apl_allocation_issues(gym,apl)) loop
  blockers:=blockers||jsonb_build_array(issue->>'message');
 end loop;
 if started is not null then
  start_year:=extract(year from started)::integer-case when extract(month from started)<7 then 1 else 0 end;
  if start_year between 2000 and 2100 then
   for idx in 0..5 loop
    year:=start_year+idx/2;
    term_starts:=array_append(term_starts,case when idx%2=0 then make_date(year,7,1) else make_date(year+1,1,1) end);
    term_ends:=array_append(term_ends,make_date(year+1,case when idx%2=0 then 1 else 7 end,1));
   end loop;
  end if;
 end if;
 -- spring_start_review is deliberately absent: it is a nonblocking review in projectAplPlan.
 -- Every overlapping pair contributes the same message before per-period issues.
 -- Pair counting preserves the blocker sequence without sorting projection-only identifiers.
 select count(*)::integer into overlap_count
 from jsonb_array_elements(apl->'periods') with ordinality a(value,position)
 cross join jsonb_array_elements(apl->'periods') with ordinality b(value,position)
 where a.position<b.position and a.value->>'startsOn' is not null and a.value->>'endsOn' is not null
  and b.value->>'startsOn' is not null and b.value->>'endsOn' is not null
  and a.value->>'startsOn'<=b.value->>'endsOn' and b.value->>'startsOn'<=a.value->>'endsOn';
 periods_overlap:=overlap_count>0;
 for n in 1..overlap_count loop
  blockers:=blockers||jsonb_build_array('Perioderna överlappar för samma planeringsgrupp. Omfattningen får inte räknas dubbelt.');
 end loop;
 select coalesce(jsonb_object_agg(r->>'key',r),'{}'::jsonb) into rows_by_key
 from jsonb_array_elements(gym#>'{source,rows}') r;
 for period in select value from jsonb_array_elements(apl->'periods') loop
  first_date:=(period->>'startsOn')::date;last_date:=(period->>'endsOn')::date;
  complete_dates:=first_date is not null and last_date is not null;
  weeks:=(period#>>'{extent,weeks}')::integer;
  if period->>'name'='' or not complete_dates or period->>'schoolYear' is null or jsonb_array_length(period->'contents')=0 then
   blockers:=blockers||jsonb_build_array('Fyll i periodens namn, datum, läsår och innehåll.');
  end if;
  if period#>>'{extent,basis}'<>'whole_weeks' or weeks is null or not (period#>>'{extent,reviewed}')::boolean then
   blockers:=blockers||jsonb_build_array('Omfattningen behöver granskas. Delveckor och osäkert underlag räknas inte automatiskt om till GUT.');
  end if;
  if complete_dates then
   first_week:=(first_date-(extract(isodow from first_date)::integer-1)-date '1969-12-29')/7;
   last_week:=(last_date-(extract(isodow from last_date)::integer-1)-date '1969-12-29')/7;
   if weeks is not null and weeks>last_week-first_week+1 then
    blockers:=blockers||jsonb_build_array('Uppgivna hela veckor överstiger antalet berörda kalenderveckor. Kontrollera datum och omfattning.');
   end if;
  end if;
  if first_date is not null and period->>'schoolYear' is not null then
   period_year:=extract(year from first_date)::integer-case when extract(month from first_date)<7 then 1 else 0 end;
   if period_year<>(period->>'schoolYear')::integer then
    blockers:=blockers||jsonb_build_array('Periodens första datum stämmer inte med valt läsår.');
   end if;
  end if;
  if started is not null and first_date is not null and first_date<started then
   blockers:=blockers||jsonb_build_array('Perioden börjar före utbildningens frysta startdatum.');
  end if;
  term_indices:='{}'::integer[];
  if complete_dates then
   if cardinality(term_starts)=6 then
    for idx in 0..5 loop
     if first_date<term_ends[idx+1] and last_date>=term_starts[idx+1] then term_indices:=array_append(term_indices,idx);end if;
    end loop;
   end if;
   if cardinality(term_starts)<>6 or first_date<term_starts[1] or last_date>=term_ends[6] then
    blockers:=blockers||jsonb_build_array('Perioden ligger helt eller delvis utanför timplanens sex terminsintervall.');
   end if;
  end if;
  for content in select value from jsonb_array_elements(period->'contents') loop
   if not rows_by_key ? (content->>'rowKey') then
    blockers:=blockers||jsonb_build_array('Innehållskopplingen saknas i den här frysta programkällan och behöver granskas.');
   elsif starts_with(content->>'rowKey','block:') or starts_with(content->>'rowKey','alternative:') or starts_with(content->>'rowKey','meta:') then
    blockers:=blockers||jsonb_build_array('Kopplingen är ett valbart block eller annat ospecificerat innehåll, inte en verifierad ämnesnivå.');
   end if;
   if content->>'description'='' then
    blockers:=blockers||jsonb_build_array('Beskriv vilken del av ämnesnivån som planeras på arbetsplatsen.');
   end if;
  end loop;
  for allocation in select value from jsonb_array_elements(period->'allocations') loop
   if complete_dates and not (allocation->>'termIndex')::integer=any(term_indices) then
    blockers:=blockers||jsonb_build_array('Tidsfördelningen avser en termin utanför periodens datum. Fördela tiden uttryckligt mellan berörda terminer.');
   end if;
  end loop;
  expected_minutes:=null;
  if supported and (period#>>'{extent,reviewed}')::boolean and period#>>'{extent,basis}'='whole_weeks' and weeks is not null then
   expected_minutes:=weeks::bigint*23*60;
  end if;
  select coalesce(sum((a->>'gutMinutes')::bigint),0) into allocated_minutes from jsonb_array_elements(period->'allocations') a;
  if expected_minutes is not null and expected_minutes<>allocated_minutes then
   blockers:=blockers||jsonb_build_array('Fördela periodens hela GUT-omfattning exakt en gång mellan innehåll och terminer.');
  end if;
  if not supported or period#>>'{extent,basis}'<>'whole_weeks' or weeks is null then reviewed_known:=false;
  elsif (period#>>'{extent,reviewed}')::boolean then reviewed_weeks:=reviewed_weeks+weeks;end if;
 end loop;
 -- Earliest deadline, then earliest start, allocating only declared week units.
 -- Adjacent int4 ranges merge; jumping to upper(occupied range) is exactly TS's while-used loop.
 for interval_row in
  select (p.first_date-(extract(isodow from p.first_date)::integer-1)-date '1969-12-29')/7 as first,
   (p.last_date-(extract(isodow from p.last_date)::integer-1)-date '1969-12-29')/7 as last,p.count
  from (
   select (value->>'startsOn')::date first_date,(value->>'endsOn')::date last_date,(value#>>'{extent,weeks}')::integer count
   from jsonb_array_elements(apl->'periods')
   where value->>'startsOn' is not null and value->>'endsOn' is not null
    and value#>>'{extent,basis}'='whole_weeks' and value#>>'{extent,weeks}' is not null
  ) p order by last,first
 loop
  candidate:=interval_row.first;
  for n in 1..interval_row.count loop
   select upper(occupied) into occupied_end from unnest(used_weeks) occupied where candidate<@occupied;
   if found then candidate:=occupied_end;end if;
   if candidate>interval_row.last then capacity_conflict:=true;exit;end if;
   used_weeks:=used_weeks+int4multirange(int4range(candidate,candidate+1,'[)'));
   candidate:=candidate+1;
  end loop;
  if capacity_conflict then exit;end if;
 end loop;
 if capacity_conflict then
  blockers:=blockers||jsonb_build_array('Periodernas uppgivna hela APL-veckor ryms inte i olika berörda kalenderveckor. Kontrollera förläggning och omfattning.');
 end if;
 if supported and not periods_overlap and not capacity_conflict and reviewed_known and reviewed_weeks<15 then
  blockers:=blockers||jsonb_build_array('Minst 15 hela granskade APL-veckor behöver planeras för den här utbildningsformen.');
 end if;
 return blockers;
end $$;

revoke all on function public.phase5_apl_allocation_issues(jsonb,jsonb),
 public.phase5_apl_validate_allocations(jsonb,jsonb),
 public.phase5_apl_confirmation_blockers(jsonb,jsonb,jsonb,jsonb)
 from public,anon,authenticated,service_role,skolplattform_worker;
