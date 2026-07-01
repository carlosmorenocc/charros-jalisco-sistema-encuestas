import React, { useState } from 'react'
import logo from '../assets/logo.png'

export default function Hero(){
  const [copied, setCopied] = useState(false)

  const shareLink = async () => {
    const url = typeof window !== 'undefined' ? window.location.href : 'https://charrosjalisco.com'

    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Encuesta Oficial Charros 2026-2027',
          text: 'Comparte esta encuesta con la afición Charros.',
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
        <h1>
          Encuesta Oficial Charros <span className="hero-year">2026-2027</span>
        </h1>
        <p className="slogan">Únete al Club más Charro</p>
        <p className="hero-description">En Charros de Jalisco queremos seguir construyendo una experiencia a la altura de nuestra afición. Responde esta breve encuesta y ayúdanos a mejorar tu visita al estadio, conocer tus intereses y enviarte promociones, preventas y beneficios pensados para ti.</p>

        <div className="hero-metrics">
          <button type="button" className="btn hero-share-btn" onClick={shareLink}>
            {copied ? 'Enlace copiado' : 'Compartir enlace para participar por premios'}
          </button>
          <div>
            <strong>Encuesta rápida</strong>
            <div>3 minutos</div>
          </div>
          <div>
            <strong>Tu opinión</strong>
            <div>mejora la experiencia</div>
          </div>
          <div>
            <strong>Promociones</strong>
            <div>y beneficios</div>
          </div>
        </div>
      </div>
    </header>
  )
}
