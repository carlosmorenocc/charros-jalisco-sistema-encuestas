import React, { lazy, Suspense } from 'react'
import Hero from './components/Hero'
import MultiStepForm from './components/MultiStepForm'
import LeadMultiStepForm from './components/LeadMultiStepForm'
import FormsPaused from './components/FormsPaused'
import AbonadosMultiStepForm from './features/abonados/AbonadosMultiStepForm'

const SorteosApp = lazy(() => import('./features/sorteos/SorteosApp'))

export default function App() {
  const pathname = typeof window !== 'undefined' ? window.location.pathname : '/'
  const isSorteosMode = pathname.startsWith('/sorteos')
  const isAbonadosMode = pathname.startsWith('/abonados')
  const isLeadsMode = pathname.startsWith('/leads')

  if (isSorteosMode) {
    return (
      <Suspense
        fallback={(
          <div
            role="status"
            style={{
              minHeight: '100vh',
              display: 'grid',
              placeItems: 'center',
              background: '#0a4388',
              color: '#ffffff',
              fontWeight: 700
            }}
          >
            Preparando el sorteo…
          </div>
        )}
      >
        <SorteosApp />
      </Suspense>
    )
  }

  const publicFormsEnabled = import.meta.env.VITE_PUBLIC_FORMS_ENABLED === 'true'
  const subscriberFormEnabled = import.meta.env.VITE_SUBSCRIBER_FORM_ENABLED === 'true'

  if ((isAbonadosMode && !subscriberFormEnabled) || (!isAbonadosMode && !publicFormsEnabled)) {
    return <FormsPaused />
  }

  const heroProps = isAbonadosMode
    ? {
      title: 'Registro de Abonados LMP 2026-2027',
      slogan: 'Tu jersey, tu temporada',
      description: 'Completa este registro breve para indicar tu talla de jersey como abonado de Charros de Jalisco para la temporada LMP 2026-2027.',
      showEngagementRow: false
    }
    : isLeadsMode
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
        {isAbonadosMode
          ? <AbonadosMultiStepForm />
          : (isLeadsMode ? <LeadMultiStepForm /> : <MultiStepForm />)}
      </main>

      <footer className="site-footer" style={{textAlign:'center',padding:12}}>
        <small>
          Aviso de privacidad: <a href="https://www.charrosjalisco.com/aviso-de-privacidad" target="_blank" rel="noreferrer">Ver documento</a>
        </small>
      </footer>
    </div>
  )
}
