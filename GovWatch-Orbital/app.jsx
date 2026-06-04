/* GovWatch — app root */
function App() {
  return (
    <React.Fragment>
      <Nav />
      <OrbitalHero />
      <Sections />
      <Footer />
    </React.Fragment>
  );
}
ReactDOM.createRoot(document.getElementById('root')).render(<App />);
