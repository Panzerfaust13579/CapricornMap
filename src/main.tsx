import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ConfigProvider, theme } from 'antd'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ConfigProvider
      theme={{
        algorithm: theme.darkAlgorithm,
        token: { colorPrimary: '#4096ff', colorSuccess: '#49aa19', colorError: '#ff6b6b', borderRadius: 6, fontSize: 14 },
        components: { Card: { headerFontSize: 15 }, Statistic: { contentFontSize: 26 } },
      }}
    >
      <App />
    </ConfigProvider>
  </StrictMode>,
)
