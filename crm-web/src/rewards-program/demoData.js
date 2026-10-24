export const REWARD_MILESTONES = [
  [2, 'Cerveza doble de cortesía'],
  [4, '2 cervezas Charros Brew'],
  [6, 'Destilado de cortesía'],
  [8, '20% en Charros Team Store'],
  [10, 'Acceso a práctica de bateo'],
  [12, 'Pase doble a Zona Grill'],
  [14, 'Visita guiada al estadio'],
  [16, 'Pase doble a juego · 2 invitados'],
  [18, 'Sorteo de invitado en CharrosTV'],
  [20, 'Sorteo de bat de colección'],
  [22, 'Pelota oficial autografiada'],
  [24, '35% en el próximo abono'],
  [26, 'Jersey firmado por jugadores'],
  [28, 'Lanzamiento de primera bola'],
  [30, 'Convivencia en Zona Grill'],
].map(([visits, benefit], index) => ({ id: `reward-${visits}`, visits, benefit, index }))

const games = [
  ['13 oct', 'Inauguración · Jaguares vs Charros'],
  ['20 oct', 'Águilas de Mexicali vs Charros · J1'],
  ['21 oct', 'Águilas de Mexicali vs Charros · J2'],
  ['22 oct', 'Águilas de Mexicali vs Charros · J3'],
]

function seats(order, zone, section, values) {
  return values.map(([seat, visits], index) => ({
    id: `${order}-${section}-${seat}`,
    order,
    zone,
    section,
    seat,
    visits,
    rewardState: visits >= 4 ? (index % 2 ? 'pending' : 'delivered') : 'on-track',
    history: games.map(([date, game], gameIndex) => ({
      date,
      game,
      attended: gameIndex < visits,
      evidence: gameIndex < visits ? 'Acceso importado' : 'Sin acceso al corte',
    })),
  }))
}

export const rewardDemoHolders = [
  {
    id: 'holder-1', name: 'ALEJANDRA RAMÍREZ VILLASEÑOR', order: '15803472', zone: 'VIP',
    seats: seats('15803472', 'VIP', '210', [['F-2', 4], ['F-3', 3], ['F-4', 2]]),
  },
  {
    id: 'holder-2', name: 'MAURICIO HERNÁNDEZ DEL CASTILLO', order: '15792208', zone: 'Preferente',
    seats: seats('15792208', 'Lateral Preferente Primera Base', '202-S1', [['H-18', 4], ['H-19', 4]]),
  },
  {
    id: 'holder-3', name: 'FERNANDA LÓPEZ', order: '15788131', zone: 'General',
    seats: seats('15788131', 'Planta Alta Central', '411-S1', [['C-7', 1]]),
  },
  {
    id: 'holder-4', name: 'ROBERTO DE LA TORRE MARTÍNEZ', order: '15784004', zone: 'General',
    seats: seats('15784004', 'Lateral Alta Tercera Base', '505', [['DD-4', 0], ['DD-5', 0], ['DD-6', 0], ['DD-7', 0]]),
  },
]

export const rewardDemoCut = {
  game: 'Águilas de Mexicali vs Charros · Juego 3',
  timestamp: '22 oct 2026 · corte 23:03',
  status: 'Reporte parcial',
  scanned: 429,
  programs: 616,
  pendingRewards: 96,
  reviewCases: 8,
}
