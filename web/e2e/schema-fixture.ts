// Geometri från tidigare syntetiskt motorprov, med den nya appens standardvillkor.
// Årsberäkningens matematik prövas med separata, nybyggda årsunderlag och riktig motor.
import proposal from './fixtures/schema-forslag.json' with { type: 'json' };

export default { ...proposal, villkor: { ...proposal.villkor, timeBasis: 'lasar' as const } };
