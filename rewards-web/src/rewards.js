export const MILESTONES = Array.from({ length: 15 }, (_, index) => (index + 1) * 2);

export function getRewardState(reward, visits) {
  if (reward.status && reward.status !== 'reversed') return 'delivered';
  if (Number(visits) >= Number(reward.milestone) + 1) return 'available';
  if (Number(visits) >= Number(reward.milestone)) return 'earned';
  return 'pending';
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
}));
