# Bolagsassistent och daglig nyhetsbevakning

Bolagssidan har fliken **Bolagsassistent**. Chatten använder Gemini och hämtar
bolagskort, analyser, finansiell historik, insynsaffärer, ägarhistorik, tidslinje,
nyheter och högst två tillgängliga rapportoriginal. Långa underlag kortas och
begränsningarna skickas med till modellen. Rapportoriginalens befintliga
30-dagarslagring är oförändrad. Inga rapportkopior eller externa sökindex skapas.

Chattar är privata för respektive användare och kräver fortsatt läsåtkomst till
bolaget. Servern hämtar alla underlag med användarens verifierade JWT och RLS.
Assistenten kan inte ändra bolagsdata. Ägaren kan stänga av chatten för ett bolag.
Högst 100 chattomgångar sparas per privat konversation; de senaste 20 visas.

## Chatt i en analys

I analysvyn öppnar chattbubblan nere till höger en flytande popup för den valda
analysen. Analysen går att scrolla och använda medan popupen är öppen. Enter
skickar frågan; Shift+Enter gör en radbrytning.
Den har egen privat historik, skild från både bolagschatten och andra analyser.
Den aktuella analysens anteckningar, estimat, justeringar, servettkalkyl och
finansiella ögonblicksbilder prioriteras framför andra analyser. Bolagets
information, rapporter, finansiella data, insynsaffärer och nyheter kan också
användas som underlag. En äldre analys hämtas uttryckligen via sitt ID.

När ägaren redigerar en upplåst analys kan de aktuella värdena i editorn skickas
med frågan, även innan autosparningen är färdig. Dessa värden märks som ett
utkast i kontexten och ändrar inte den sparade analysen. Mottagare och låsta
analyser använder den sparade analysen. Att öppna chatten gör inget AI-anrop;
användaren måste skicka en fråga. Samma Gemini-kvoter och bolagets
chattinställning gäller även här. Historik som hör till en analys tas bort när
den analysen raderas; bolagets övriga chattar finns kvar.

Analyschatten får även en tillfällig kopia av tabellens beräknade värden, bland
annat MoS, estimerad kurs, vinst per aktie och periodens effektiva P/E. Den kommer
från samma beräkning som tabellen, med dess lokala P/E-inställning och valutakurs,
och anges som källa V0. Detta fungerar även för låsta analyser och mottagare med
läsbehörighet; kopian ger ingen skrivåtkomst och sparas inte i analysen. Högst
40 perioder tas med, med nästa kalenderår först. Saknade värden skickas inte som
noll. Källan markerar om perioder har behövt utelämnas.

## Kostnad och kvoter

Projektets Gemini-nyckel måste tillhöra **Free Tier**, utan anslutet
faktureringskonto. Applikationskod kan inte verifiera eller låsa Googles
betalningsnivå. Aktivera inte fakturering för projektet om driften ska vara gratis.
Inga betalningsinställningar ändras av funktionen. Befintliga Supabase-kvoter
gäller även för tabeller, anrop, lagring och schemalagda körningar.

AI-anrop använder endast Gemini Developer API, utan betalda sökverktyg, caching,
andra leverantörer, automatiska återförsök eller automatisk modellväxling.
Gemini-modellen är `gemini-2.5-flash` som standard, samma modell som redan används
av Napsys sammanfattningar. `COMPANY_AI_MODEL` kan välja en annan modell som
projektet faktiskt har tillgång till inom sin gratisnivå. Ett modellfel stoppar
anropet; det leder inte till byte till en annan tjänst.

Konservativa gränser ligger i `claim_company_ai_request`:

- Högst 50 modellförfrågningar per Google-projektets Pacific-dygn för den nya
  funktionen (chatt och nyhetssammanfattningar tillsammans).
- Högst fem modellförfrågningar per minut för hela funktionen.
- Högst 20 chattfrågor per användare och dygn, högst två per minut.
- Reservationer räknas även när ett modellfel uppstår. Googles egna gränser kan
  vara lägre; de befintliga AI-funktionerna delar också Googles projektkvot.
- HTTP 429 från Gemini sparar en gemensam paus. Ingen automatisk begäran om
  högre kvot görs. `COMPANY_AI_ENABLED=false` stoppar den nya funktionens AI-anrop.

## Nyhetsflöden

Menyn **Nyheter** (`/news`) samlar sparade nyheter för alla tillgängliga bolag
där bevakningen är påslagen, även delade bolag. Flödet kan filtreras på bolag
och läser fler nyheter i sidor om 40 poster. **Uppdatera vyn** läser databasen;
den kör ingen ny insamling eller AI-förfrågan. Fliken **X / Twitter** öppnar
sökningar på X med bolagsnamn och eventuell ticker, med senaste inlägg först.
Inga X-inlägg importeras eller sammanfattas automatiskt; ingen betald
X-anslutning eller fakturering aktiveras. X kan kräva inloggning.

Nyhetsbevakning är avstängd tills bolagsägaren aktiverar den. Utan egna flöden
hämtas Google News RSS med bolagsnamnet som exakt sökfras. Upp till fem egna
HTTPS-flöden stöds från `news.cision.com`, `news.google.com`, `mfn.se`,
`www.mfn.se`, `www.di.se` och `feeds.feedburner.com`. Källorna kan själva ändra
eller begränsa åtkomsten. Detta är RSS-rubriker och publicerade utdrag; inga
betalväggar kringgås och fullständiga artiklar hämtas inte. X ingår inte.

En dispatcher körs vid minut 17 varje timme och behandlar bolag som är minst
24 timmar gamla sedan senaste kontrollen. Det gör att fel, begränsningar och
större listor kan hämtas ikapp. Körningen har en tidsgräns och läser högst 20
bolag per körning. Manuella hämtningar är begränsade till en per bolag och timme.
Nyheter sparas även om AI-kvoten är slut. Nyhetsposter gallras till högst 200 per
bolag och 90 dagar vid nästa hämtning. Källangivelserna i en sammanfattning har
en egen lista och påverkas inte av senare sortering i nyhetslistan.

## Driftsättning

Följ AGENTS.md och kör de tre nya migrationerna från terminalen, en i taget,
efter lokala tester. Registrera varje version först efter lyckad SQL-körning.
Kör inte generell `db push`: den äldre rapportstädningen har en känd
versionsskillnad mellan lokal och tillämpad historik.

Schemaläggningsmigreringen skapar Vault-hemligheten `company_news_cron_token`.
Kopiera värdet säkert till Edge Function-hemligheten `COMPANY_NEWS_CRON_TOKEN`
med en tillfällig env-fil och `supabase secrets set --env-file`. Skriv aldrig ut
värdet i loggar, chatten eller versionshanterade filer. Återanvänd befintlig
`GEMINI_API_KEY`. Deploya `company-chat` och `company-news`, inklusive respektive
relativa beroenden och `company-news/deno.json`. Behåll `verify_jwt=true`.
Båda funktionerna validerar dessutom själva användarens JWT; nyhetsfunktionen
accepterar även den privata schemaläggartoken.

Före den tredje migreringen sparas projektets publika, aktiva legacy anon-nyckel
i Vault som `company_news_gateway_key`. Nyckeln passerar endast gatewayens
JWT-kontroll och ger ingen schemaläggarbehörighet utan den separata privata
token. Den tredje migreringen lägger till dessa gatewayheaders och lämnar
jobbet pausat. Aktivera `company-news-hourly` efter funktionskontroller med
`cron.alter_job(..., active := true)`. Vid nyckelrotation uppdateras Vault-värdet.

## Stäng av eller återställ

Ägaren stänger av chatt och/eller bevakning i respektive bolags inställningar.
Detta behåller historiken och påverkar inte ursprungliga analyser.

För att stoppa all automatisk insamling kan driftansvarig inaktivera jobbet
`company-news-hourly` i Supabase Cron eller köra:

```sql
select cron.alter_job(
  job_id := (select jobid from cron.job where jobname = 'company-news-hourly'),
  active := false
);
```

För full återställning av gränssnittet kan flikimporten och fliken i
`CompanyDetail.tsx` tas bort. Behåll additiva tabeller tills eventuell exporterad
chatthistorik har hanterats. Radera inte äldre migrationer eller bolagsdata för
att stänga av funktionen. En framtida leverantör kan använda samma kontext och
tabeller, men kräver ett uttryckligt val och egen kostnadskontroll.
