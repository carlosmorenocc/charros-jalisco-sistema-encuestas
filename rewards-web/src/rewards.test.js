import { describe, expect, it } from 'vitest';
import {
  canDeliverReward,
  DEFAULT_REWARDS,
  getRewardState,
  MILESTONES,
} from './rewards.js';

describe('ruta de recompensas', () => {
  it('conserva los 15 hitos pares del 2 al 30', () => {
    expect(MILESTONES).toEqual([2,4,6,8,10,12,14,16,18,20,22,24,26,28,30]);
  });

  it('reserva el sorteo únicamente para el bat del hito 20', () => {
    expect(DEFAULT_REWARDS.find(({ milestone }) => milestone === 18)).toMatchObject({
      benefit: 'Invitado especial en CharrosTV',
      benefit_type: 'direct',
    });
    expect(DEFAULT_REWARDS.find(({ milestone }) => milestone === 20)).toMatchObject({
      benefit_type: 'raffle',
    });
  });

  it('mantiene el hito dorado en N y cambia su estado visual después de N', () => {
    const reward = { milestone:4,redeem_from_offset:0 };
    expect(getRewardState(reward,3)).toBe('pending');
    expect(getRewardState(reward,4)).toBe('earned');
    expect(getRewardState(reward,5)).toBe('available');
  });

  it('no muestra un hito como disponible antes del umbral configurado', () => {
    const reward = { milestone:4,redeem_from_offset:2 };
    expect(getRewardState(reward,4)).toBe('earned');
    expect(getRewardState(reward,5)).toBe('earned');
    expect(getRewardState(reward,6)).toBe('available');
  });

  it('usa el desfase del catálogo para decidir si se puede registrar la entrega', () => {
    expect(canDeliverReward({ milestone:4,redeem_from_offset:0 },4)).toBe(true);
    expect(canDeliverReward({ milestone:4,redeem_from_offset:1 },4)).toBe(false);
    expect(canDeliverReward({ milestone:4,redeem_from_offset:1 },5)).toBe(true);
    expect(canDeliverReward({ milestone:4 },4)).toBe(true);
  });

  it('prioriza una entrega activa y permite ignorar una ya revertida', () => {
    expect(getRewardState({ milestone:4,status:'delivered' },0)).toBe('delivered');
    expect(getRewardState({ milestone:4,status:'reversed' },5)).toBe('available');
  });
});
