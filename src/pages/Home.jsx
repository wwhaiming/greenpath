import LegalDisclaimer from '../components/LegalDisclaimer.jsx'

export default function Home({ navigate }) {
  return (
    <section>
      <div className="home-hero">
        <div className="home-hero-inner">
          <div className="kicker-rule" />
          <div className="kicker">A clear starting point</div>
          <h1 className="h1">One clear place to begin.</h1>
          <p className="lede">GreenPath organizes the green-card journey into visible, human-sized steps — in your language, at your pace.</p>
          <div className="btn-row" style={{ marginTop: '30px' }}>
            <button className="btn btn-primary" onClick={() => navigate('guided')}>Start My Walkthrough</button>
            <button className="btn btn-ghost" onClick={() => navigate('hero2')}>See How It Works</button>
          </div>
        </div>
        <div className="home-hero-glow" />
      </div>

      <div className="rail-wrap">
        <div className="rail-line" />
        <div className="nodes">
          <div className="node"><div className="dot c-green">01</div><h3>Guided Walkthrough</h3><p>Understand possible pathways</p></div>
          <div className="node"><div className="dot c-slate">02</div><h3>Progress Tracking</h3><p>See what comes next</p></div>
          <div className="node"><div className="dot c-amber">03</div><h3>Deadline Alerts</h3><p>Keep important dates visible</p></div>
          <div className="node"><div className="dot c-terra">04</div><h3>Language Tools</h3><p>Translate, scan, and listen</p></div>
          <div className="node"><div className="dot c-green">05</div><h3>Document Review</h3><p>Check for possible issues</p></div>
          <div className="node"><div className="dot c-slate">06</div><h3>Interview Prep</h3><p>Practice with confidence</p></div>
        </div>
      </div>

      <div className="clarity-row">
        <span className="pill">DESIGNED FOR CLARITY</span>
        <span>Every section is reachable from the top navigation.</span>
      </div>

      <LegalDisclaimer page={1} />
    </section>
  )
}
