import React, { useState } from 'react'
import logo from '../assets/logo.png'

const defaultMetrics = [
  { title: 'Encuesta rápida', text: '3 minutos' },
  { title: 'Tu opinión', text: 'mejora la experiencia' },
  { title: 'Promociones', text: 'y beneficios' }
]

function renderHeroTitle(title) {
  if (typeof title !== 'string') return title
  const match = title.match(/^(.*)\s(\d{4}-\d{4})$/)
  if (!match) return title

  return (
    <>
      {match[1]} <span className="hero-year">{match[2]}</span>
    </>
  )
}

export default function Hero({
  title = 'Encuesta Oficial Charros 2026-2027',
  slogan = 'Únete al Club más Charro',
  description = 'En Charros de Jalisco queremos seguir construyendo una experiencia a la altura de nuestra afición. Responde esta breve encuesta y ayúdanos a mejorar tu visita al estadio, conocer tus intereses y enviarte promociones, preventas y beneficios pensados para ti.',
  shareTitle = 'Encuesta Oficial Charros 2026-2027',
  shareText = 'Comparte esta encuesta con la afición Charros.',
  shareButtonText = 'Compartir enlace para participar por premios',
  metrics = defaultMetrics
}){
  const [copied, setCopied] = useState(false)

  const shareLink = async () => {
    const url = typeof window !== 'undefined' ? window.location.href : 'https://charrosjalisco.com'

    if (navigator.share) {
      try {
        await navigator.share({
          title: shareTitle,
          text: shareText,
          url
        })
        return
      } catch (error) {
        console.warn('Share cancelled', error)
      }
    }

    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (error) {
      console.warn('Unable to copy link', error)
    }
  }

  return (
    <header className="hero">
      <div className="hero-inner">
        <a
          href="https://www.charrosjalisco.com/"
          target="_blank"
          rel="noreferrer"
          className="logo-link"
          aria-label="Ir al sitio oficial de Charros de Jalisco"
        >
          <img src={logo} alt="Charros logo" className="logo" />
        </a>
        <h1>{renderHeroTitle(title)}</h1>
        <p className="slogan">{slogan}</p>
        <p className="hero-description">{description}</p>

        <div className="hero-metrics">
          <button type="button" className="btn hero-share-btn" onClick={shareLink}>
            {copied ? 'Enlace copiado' : shareButtonText}
          </button>
          {metrics.map((metric) => (
            <div key={metric.title}>
              <strong>{metric.title}</strong>
              <div>{metric.text}</div>
            </div>
          ))}
        </div>
      </div>
    </header>
  )
}
