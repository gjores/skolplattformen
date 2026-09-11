import json,re
from pathlib import Path
root=Path('/Users/petter.gjores/dev/skolplattform')
out=root/'docs/schoolsoft'
original=Path('/Users/petter.gjores/Documents/Codex/2026-09-04/skolplattformen/outputs/underlag')
doc=(original/'04-granskning-testskolan-plandigital.md').read_text()
base=(original/'01-funktionskartlaggning.md').read_text()
(out/'observations-2026-09-04.md').write_text(doc[:doc.index('## Plan Digital: verifierade funktioner')]+ '\nDetta utdrag återger tidigare observationer, inte en ny granskning den 5 september. Original: projektets underlag 04.\n')
(out/'baslinje-2026-09-04.md').write_text(base[:base.index('## Plan Digital: förmågor')])
data=json.loads((out/'funktionsregister.json').read_text())
data['sources']['O04'][1]='observations-2026-09-04.md'
data['sources']['O01'][1]='baslinje-2026-09-04.md'
data['sources']['CODE'][1]='/Users/petter.gjores/dev/skolplattform/web/app/admin-workspace.tsx'
for item in data['items']:
 if item['id']=='I04':
  item['sources']=['GR']
  item['schoolsoft']='Integration till Google Classroom och Microsofts lärmiljö nämns; fullständigt flöde är inte styrkt.'

legacy={1:'U01',2:'U02',3:'U03',4:'I03 I04',5:'U04 B03',6:'D01',7:'D02',8:'D03',9:'D04',10:'U05',11:'D05',12:'D06',13:'D07',14:'N06',15:'D08',16:'K01',17:'K04',18:'K09',19:'U06',20:'D09',21:'D10',22:'Q03',23:'K05',24:'E01',25:'E05',26:'E06',27:'E07 G01',28:'R08',29:'R09',30:'P03',31:'B03',32:'B05 B08',33:'R01 R02 R03 R04',34:'E09',35:'E11',36:'E10 X02',37:'K02',38:'X02',39:'R10',40:'I05',41:'S07',42:'T02',43:'S06',44:'S05',45:'S08',46:'S09',47:'S10',48:'S11 T03',49:'S12 S15',50:'R05',51:'N01',52:'N03',53:'K08',54:'M01',55:'M02',56:'M03',57:'X01',58:'X03',59:'X04',60:'E09'}
old=[]
for line in base.splitlines():
 m=re.match(r'\| SS(\d+) \| ([^|]+)',line)
 if m:
  n=int(m[1]);old.append(dict(id=f'SS{n:02}',title=m[2].strip(),mapped_to=legacy[n].split()))

mapping={
'Alla elever':'N01','Alla filer & länkar':'K07','Alla scheman':'S01','Användarinställningar':'I06','Avstämningsperiod':'D09','Betyg':'B03 B08','Betygsatta kurser':'B04','Betygsgrupper':'B01','Betygskataloger':'B05','Betygsperiod':'B02','Betygsämnen':'B01','Betygsändringar':'B06','Betygsättningslistor':'B01','Betygsöversikt':'B04','Bilduppladdning':'I07','Bokningar':'K06','Dokumentmallar':'I08','Elev-Grupper':'G02','Elevavstämning (GY11)':'D09','Elevavstämning (GY25)':'D09','Elevdokument rapporter':'D06','Elever':'E01','Elever Admin':'I02','Elevfilter':'R06','Elevkort':'E02','Elevkort för inaktiva elever':'E08','Elevrapporter':'R06','Elevrapportering CSN':'R02','Enkäter':'Q03','Fakturamottagare':'I09','Filer & länkar':'K07','Filuppladdning':'I08','Formulär':'D05','Forum':'K07','Fria grupper':'G03','Frågor':'D05','Fälttyper':'I07','Färgmarkering':'I07','Garanterad undervisningstid':'S11','Grundskolebetyg':'I02 B03','Grupper':'G01','Importera schema':'S13','Klasslistor':'E12','Kommuner':'R07','Kommunrapporter':'R07','Korthantering':'I09','Kurs – Elev':'P05','Kurser':'P02','Kursutvärderingar':'Q04','Kursvarningar':'D08','Lektioner':'I02 S02','Lämna omdöme':'D02','Mallar':'D05','Meddelanden':'K01','Mentorssamtal':'D10','Mina filer':'K07','Nationella kursprov':'B10','Nationella prov':'B10','Nyheter':'K03','Närvaro':'N07','Närvaro per skola':'N07','Närvaro – Dagar':'N06','Närvaro – Orsak':'N06','Närvaro – Procent':'N06','Närvaro – Vecka':'N06','Närvaro – Ämne':'N06','Oanmäld frånvaro':'N04','Perioder':'S03','Personal':'T01','Planeringsverktyg':'U10','Program':'P01','Program/Studieplaner':'I02 P03','Provschema (Genväg)':'U09','Publicerade nyheter':'K03','Rapport':'D06','Rapport Elevavstämning (GY11)':'D09','Rapport Elevavstämning (GY25)':'D09','Rapport elevavstämning (GY11)':'D09','Rapport elevavstämning (GY25)':'D09','Rapportbeställning':'R06','Rapporter':'R01 R02 R03 R04','Rapporter (GY11)':'R01 R02 R03 R04','Rapporteringsnivå':'N05','Sal':'S04','Salar & Utrustning':'S04','Sammantagen bedömning':'B11','Sammantagen bedömning (GY11)':'B11','Sammantagen bedömning (NY)':'B11','Schema & Kalender':'S01 K05','Scheman':'S01','Skapa betygsdokument':'B08','Skola':'I06','Skolinfo':'K03','Skolinformation':'K03','Skolkalender':'K05','Studiehantering (BETA)':'P01 P02 P03 P04 P05 P06 P07 P08 P09 P10 P11','Studieplaner':'P03','Systeminställningar':'I06','Tidigare skolformer':'B08','Undervisning':'N07','Undervisningsgrupper':'G01','Uppgifter':'U04 U08 U10','Visa anmälningar':'N01','Vårdnadshavare':'E03','Ämnen':'P02'}
menus=[]
section=''
for line in doc[doc.index('### Startsida'):doc.index('Skolledarens startsida')].splitlines():
 if line.startswith('### '):section=line[4:]
 if line.startswith('|') and not line.startswith('|---'):
  cells=[c.strip() for c in line.strip('|').split('|')]
  if len(cells)!=2 or cells[0]=='Menygrupp':continue
  group=cells[0]
  for name in cells[1].split(','):
   name=name.strip();ids=mapping[name].split()
   if group=='Enkäter': ids={'Frågor':['Q01'],'Formulär':['Q02'],'Rapport':['Q05']}.get(name,ids)
   if group=='Skolrapporter' and name=='Närvaro – Dagar':ids=['N07']
   if group=='Pedagogiskt stöd' and name in ['Ämnen','Forum']:ids=['U07']
   if group=='Export/Import':ids=list(dict.fromkeys(['I02']+ids))
   if group=='Äldre funktioner':ids=list(dict.fromkeys(['U10']+ids))
   menus.append(dict(path=f'{section} → {group} → {name}',mapped_to=ids,evidence='Meny enligt tidigare protokoll; inte fullständigt funktionstest'))
for name,ids in [('Admin → Systembehörighet',['I01']),('Admin → Behörighetsgrupper',['I01']),('Admin → Externt schema',['S13'])]:
 menus.append(dict(path=name,mapped_to=ids,evidence='Länk eller sektion enligt tidigare protokoll'))
valid={i['id'] for i in data['items']}
assert len(old)==60 and len(set(i['id'] for i in old))==60
assert len(data['items'])==len(valid)
for row in old+menus:assert row['mapped_to'] and all(i in valid for i in row['mapped_to']),row
for item in data['items']:
 item['legacy_ids']=[r['id'] for r in old if item['id'] in r['mapped_to']]
 item['menu_paths']=[r['path'] for r in menus if item['id'] in r['mapped_to']]
 # Pending validation is explicit rather than a fabricated test result.
 item['schoolsoft_flow_verified']=False
 item['acceptance_result']='Ej genomfört som användarprov'
 item['priority']='Nästa kärna' if item['id'][0] in ['E','P','G','T','S','N','B','L'] else 'Efter beroenden'
 if item['app_status'] in ['Utanför kärnan','Omfattningsval']:item['priority']='Omfattningsbeslut'
data['coverage']={'legacy':old,'menus':menus}
(out/'funktionsregister.json').write_text(json.dumps(data,ensure_ascii=False,indent=2))
print(json.dumps({'items':len(data['items']),'legacy_mapped':len(old),'menu_paths_mapped':len(menus),'source_records':len(data['sources'])},ensure_ascii=False))
