export const MILESTONES = Array.from({ length: 15 }, (_, index) => (index + 1) * 2);

export function getRewardState(reward, visits) {
  if (reward.status && reward.status !== 'reversed') return 'delivered';
  const milestone = Number(reward?.milestone);
  const visitCount = Number(visits);
  const configuredOffset = Number(reward?.redeem_from_offset ?? reward?.redeemFromOffset ?? 0);
  const offset = Number.isInteger(configuredOffset) && configuredOffset >= 0 ? configuredOffset : 0;

  if (visitCount >= Math.max(milestone + 1, milestone + offset)) return 'available';
  if (visitCount >= milestone) return 'earned';
  return 'pending';
}

export function canDeliverReward(reward, visits) {
  const milestone = Number(reward?.milestone);
  const visitCount = Number(visits);
  const offset = Number(reward?.redeem_from_offset ?? reward?.redeemFromOffset ?? 0);

  if (!Number.isFinite(milestone) || milestone < 0) return false;
  if (!Number.isFinite(visitCount) || visitCount < 0) return false;
  if (!Number.isInteger(offset) || offset < 0) return false;
  return visitCount >= milestone + offset;
}

export const DEFAULT_REWARDS = [
  [2, 'Cerveza doble de cortesía', 'direct'],
  [4, 'Dos cervezas Charros Brew', 'direct'],
  [6, 'Destilado de cortesía', 'direct'],
  [8, '20% en Charros Team Store', 'direct'],
  [10, 'Acceso a práctica de bateo', 'direct'],
  [12, 'Pase doble a Zona Grill', 'direct'],
  [14, 'Visita guiada al estadio', 'direct'],
  [16, 'Pase doble a juego', 'direct'],
  [18, 'Invitado especial en CharrosTV', 'direct'],
  [20, 'Sorteo bat de colección', 'raffle'],
  [22, 'Pelota autografiada', 'direct'],
  [24, '35% en próximo abono', 'direct'],
  [26, 'Jersey firmado', 'direct'],
  [28, 'Primera bola grupal', 'direct'],
  [30, 'Convivencia Zona Grill', 'direct'],
].map(([milestone, benefit, benefitType]) => ({
  milestone,
  benefit,
  benefit_type: benefitType,
  redeem_from_offset: 0,
}));
