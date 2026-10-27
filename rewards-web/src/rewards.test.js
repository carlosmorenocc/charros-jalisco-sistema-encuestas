import { describe, expect, it } from 'vitest';
import { DEFAULT_REWARDS, getRewardState, MILESTONES } from './rewards.js';

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

  it('alcanza el hito en N y lo habilita hasta la asistencia N + 1', () => {
    const reward = { milestone:4 };
    expect(getRewardState(reward,3)).toBe('pending');
    expect(getRewardState(reward,4)).toBe('earned');
    expect(getRewardState(reward,5)).toBe('available');
  });

  it('prioriza una entrega activa y permite ignorar una ya revertida', () => {
    expect(getRewardState({ milestone:4,status:'delivered' },0)).toBe('delivered');
    expect(getRewardState({ milestone:4,status:'reversed' },5)).toBe('available');
  });
});
