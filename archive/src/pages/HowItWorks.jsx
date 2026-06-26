import LegalDisclaimer from '../components/LegalDisclaimer.jsx'

export default function HowItWorks({ navigate }) {
  return (
    <section>
      <div className="split">
        <div>
          <div className="badge-row">PERSONALIZED &nbsp;•&nbsp; MULTILINGUAL &nbsp;•&nbsp; CLEAR</div>
          <h1 className="hero-h">Your next step should not be a mystery.</h1>
          <p className="lede">GreenPath helps you understand possible pathways, organize documents, track deadlines, and prepare questions in your preferred language.</p>
          <div className="btn-row">
            <button className="btn btn-primary" onClick={() => navigate('guided')}>Start My Walkthrough</button>
            <button className="btn btn-ghost" onClick={() => navigate('home')}>Explore Features</button>
          </div>
          <p className="note-strong">Built to guide. Designed to know when to hand off.</p>
          <p className="note">Complex situations are redirected to authorized legal help.</p>
        </div>
        <div className="roadmap-card">
          <div className="kicker">Your roadmap</div>
          <h2>A visible path forward</h2>
          <div className="road-step"><div className="rnum c-green">1</div><div><h4>Tell us your situation</h4><p>Plain-language questions</p></div></div>
          <div className="road-step"><div className="rnum c-slate">2</div><div><h4>See a possible pathway</h4><p>Official sources linked</p></div></div>
          <div className="road-step"><div className="rnum c-amber">3</div><div><h4>Follow your checklist</h4><p>Progress saved locally</p></div></div>
          <div className="road-step"><div className="rnum c-terra">4</div><div><h4>Know when to ask for help</h4><p>Authorized support referrals</p></div></div>
        </div>
      </div>
      <LegalDisclaimer page={2} />
    </section>
  )
}
