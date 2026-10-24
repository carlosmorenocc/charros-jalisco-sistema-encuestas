import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles.css'

const rewardsPreview = import.meta.env.DEV && new URLSearchParams(window.location.search).get('rewards-preview') === '1'
const Root = rewardsPreview
  ? React.lazy(() => import('./rewards-program/RewardsProgram'))
  : App

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <React.Suspense fallback={null}>
      <Root />
    </React.Suspense>
  </React.StrictMode>,
)
