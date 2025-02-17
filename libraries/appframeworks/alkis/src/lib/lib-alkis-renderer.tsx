type AlkisRendererProps = {
  landparcelId: string;
  jwt: string;
};
export function AlkisRenderer({ landparcelId, jwt }: AlkisRendererProps) {
  return (
    <div>
      <h1>Alkis render</h1>
    </div>
  );
}
