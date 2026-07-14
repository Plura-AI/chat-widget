import { ChatWidget } from './ChatWidget'

const FLOW_ID = '9792cfaf-5a7a-418d-b32f-f9c49e8b2807'
const RECORD = { token: 'dev-test' }

function App() {
  return (
    <ChatWidget
      flowId={FLOW_ID}
      record={RECORD}
      mode="bubble"
    />
  )
}

export default App
