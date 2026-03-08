import React from 'react'
import ReactDOM from 'react-dom/client'
import PopupApp from './components/PopupApp'
import './index.css'

// 关键：确保指向 popup-root
const rootElement = document.getElementById('popup-root');
if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <PopupApp />
    </React.StrictMode>,
  )
}
