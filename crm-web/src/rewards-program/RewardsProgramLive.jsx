import React, { useEffect, useMemo, useState } from 'react'
import RewardsProgram from './RewardsProgram'

function groupPrograms(programs) {
  const holders = new Map()
  programs.forEach((program) => {
    const key = `${program.order_number}:${program.name}`
    if (!holders.has(key)) holders.set(key, {
      id: key,
      name: program.name,
      order: program.order_number,
      zone: program.zone,
      seats: [],
    })
    holders.get(key).seats.push({
      id: program.id,
      zone: program.zone,
      section: program.section,
      seat: program.seat,
      visits: Number(program.visits || 0),
      rewardState: Number(program.delivered_rewards || 0) > 0 ? 'delivered' : Number(program.visits || 0) >= 2 ? 'pending' : 'on-track',
      history: [],
      rewards: [],
    })
  })
  return [...holders.values()]
}

function mapProfile(program) {
  return {
    id: program.id,
    zone: program.zone,
    section: program.section,
    seat: program.seat,
    visits: Number(program.visits || 0),
    rewardState: (program.rewards || []).some((reward) => reward.delivery_status === 'delivered') ? 'delivered' : 'on-track',
    rewards: program.rewards || [],
    history: (program.history || []).map((game) => ({
      date: game.played_on ? new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short' }).format(new Date(`${game.played_on}T12:00:00`)) : 'Sin fecha',
      game: game.display_name,
      attended: Boolean(game.attended),
      evidence: game.attended ? 'Acceso importado' : 'Sin acceso al corte',
    })),
  }
}

export default function RewardsProgramLive({ api, user, onLogout, embedded = false }) {
  const [summary, setSummary] = useState(null)
  const [holders, setHolders] = useState([])
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    async function load() {
      try {
        const [summaryResponse, firstPage] = await Promise.all([
          api.rewardSummary(),
          api.rewardPrograms({ page: 1, pageSize: 100 }),
        ])
        const programs = [...firstPage.data]
        const pages = Number(firstPage.meta?.totalPages || 1)
        for (let page = 2; page <= pages; page += 1) {
          const response = await api.rewardPrograms({ page, pageSize: 100 })
          programs.push(...response.data)
        }
        if (!active) return
        setSummary(summaryResponse.data)
        setHolders(groupPrograms(programs))
      } catch (loadError) {
        if (active) setError(loadError.message || 'No fue posible cargar el programa de recompensas.')
      }
    }
    load()
    return () => { active = false }
  }, [api])

  const cut = useMemo(() => {
    const game = summary?.currentGame
    return {
      game: game?.display_name || 'Sin partido importado',
      timestamp: game?.played_on ? new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium' }).format(new Date(`${game.played_on}T12:00:00`)) : 'Esperando primer corte',
      status: game?.report_status === 'closed' ? 'Reporte cerrado' : 'Reporte parcial',
      scanned: Number(game?.unique_accesses || 0),
      programs: Number(summary?.programs || 0),
      pendingRewards: Math.max(0, Number(summary?.programs || 0) - Number(summary?.delivered || 0)),
      reviewCases: Number(summary?.review_cases || 0),
    }
  }, [summary])

  async function loadHolder(holder) {
    const seats = await Promise.all(holder.seats.map(async (seat) => mapProfile((await api.rewardProgram(seat.id)).data)))
    return { ...holder, seats }
  }

  async function deliver({ seatId, rewardId }) {
    await api.deliverRewardCoupon(seatId, rewardId, crypto.randomUUID())
  }

  if (error) return <div className="rp-live-error" role="alert"><strong>No pudimos abrir Recompensas</strong><p>{error}</p><button onClick={() => window.location.reload()}>Intentar de nuevo</button></div>

  return <RewardsProgram
    holders={holders}
    cut={cut}
    actor={{ name: user.name, role: user.role }}
    onOpenHolder={loadHolder}
    onDeliver={deliver}
    onLogout={onLogout}
    embedded={embedded}
  />
}
