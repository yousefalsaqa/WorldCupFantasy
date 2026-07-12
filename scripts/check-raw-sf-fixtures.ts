import { apiFootball } from '../src/lib/api-football';
async function main() {
  const fixtures = await apiFootball.getWorldCupFixtures();
  const semis = fixtures.filter(f => /semi/i.test(f.league.round));
  console.log(`Found ${semis.length} fixtures with "semi" in round label:`);
  for (const f of semis) {
    console.log(`  ${f.teams.home.name} (id=${f.teams.home.id}) vs ${f.teams.away.name} (id=${f.teams.away.id}) | round="${f.league.round}" | date=${f.fixture.date} | status=${f.fixture.status.short}`);
  }
}
main();
