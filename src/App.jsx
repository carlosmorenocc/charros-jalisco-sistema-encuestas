import React from 'react'
import Hero from './components/Hero'
import MultiStepForm from './components/MultiStepForm'
import LeadMultiStepForm from './components/LeadMultiStepForm'

export default function App() {
  const pathname = typeof window !== 'undefined' ? window.location.pathname : '/'
  const isLeadsMode = pathname.startsWith('/leads')

  const heroProps = isLeadsMode
    ? {
      title: 'Registro Oficial de Charros de Jalisco',
      slogan: 'Súmate a la base oficial en estadio',
      description: 'Completa este registro rápido durante el juego. Este formulario permite un registro por correo por día y te ayudará a recibir futuros incentivos y dinámicas del club.',
      shareTitle: 'Registro Oficial de Charros de Jalisco',
      shareText: 'Comparte este registro de correo para aficionados en estadio.',
      shareButtonText: 'Compartir registro de correo',
      metrics: [
        { title: 'Registro exprés', text: '1 minuto' },
        { title: 'Un registro diario', text: 'por correo' },
        { title: 'Base oficial', text: 'de aficionados' }
      ]
    }
    : {}

  return (
    <div className="app-root">
      <Hero {...heroProps} />

      <main className="container">
        {isLeadsMode ? <LeadMultiStepForm /> : <MultiStepForm />}
      </main>

      <footer className="site-footer" style={{textAlign:'center',padding:12}}>
        <small>
          Aviso de privacidad: <a href="https://www.charrosjalisco.com/aviso-de-privacidad" target="_blank">Ver documento</a>
        </small>
      </footer>
    </div>
  )
}
