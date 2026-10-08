export function meta() {
  return [
    { title: "sixth-slot" },
    {
      name: "description",
      content:
        "Plan the best team for a playthrough, starting from your starter.",
    },
  ];
}

export default function Home() {
  return (
    <main className="container mx-auto p-4 pt-16">
      <h1 className="text-3xl font-bold">sixth-slot</h1>
      <p className="mt-2 text-muted-foreground">
        Plan the best team for a playthrough, starting from your starter.
      </p>
    </main>
  );
}
