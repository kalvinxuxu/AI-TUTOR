// AI Tutoring - Session Page
// TODO: Implement session view with tutor interaction

export default function SessionPage({ params }: { params: { id: string } }) {
  return (
    <div className="container">
      <h1>Session: {params.id}</h1>
      <p>Tutor session functionality coming soon.</p>
    </div>
  );
}