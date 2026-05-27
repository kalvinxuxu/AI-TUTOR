// AI Tutoring - Session Page
// TODO: Implement session view with tutor interaction

interface SessionPageProps {
  params: Promise<{ id: string }>;
}

export default async function SessionPage({ params }: SessionPageProps) {
  const { id } = await params;
  return (
    <div className="container">
      <h1>Session: {id}</h1>
      <p>Tutor session functionality coming soon.</p>
    </div>
  );
}