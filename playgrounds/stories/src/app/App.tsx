export default function App() {
  return (
    <div style={{ padding: '2rem', fontFamily: 'system-ui, sans-serif' }}>
      <h1>Stories Playground</h1>
      <p>
        This is a Storybook project. Please run:
      </p>
      <pre style={{ background: '#f0f0f0', padding: '1rem', borderRadius: '4px' }}>
        npx nx storybook stories
      </pre>
      <p>
        To view the interactive component stories.
      </p>
    </div>
  );
}
