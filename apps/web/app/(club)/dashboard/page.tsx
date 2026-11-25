"use client";

import { api } from "@/lib/api";
import { useSession } from "@/lib/session";
import { formatEventWhen, injuryUpdateLabel, type Dashboard } from "@myclub/shared";
import { Card, Tabs } from "@heroui/react";
import { ArcElement, Chart as ChartJS, Legend, Tooltip } from "chart.js";
import { useEffect, useState } from "react";
import { Doughnut } from "react-chartjs-2";

ChartJS.register(ArcElement, Tooltip, Legend);

export default function DashboardPage() {
  const session = useSession();
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (
      session.status !== "in" ||
      !session.token ||
      !session.clubId ||
      session.role !== "manager"
    )
      return;
    const token = session.token;
    const clubId = session.clubId;
    let cancelled = false;
    api
      .dashboard(token, clubId)
      .then((next) => {
        if (!cancelled) setData(next);
      })
      .catch((err: unknown) => {
        if (!cancelled)
          setError(
            err instanceof Error
              ? err.message
              : "Could not load the dashboard.",
          );
      });
    return () => {
      cancelled = true;
    };
  }, [session.status, session.token, session.clubId, session.role]);

  return (
    <div className="dash">
      <div className="page-title">
        <h1>Dashboard</h1>
      </div>
      <Tabs defaultSelectedKey="games">
        <Tabs.ListContainer>
          <Tabs.List aria-label="Dashboard">
            <Tabs.Tab id="games">
              Games
              <Tabs.Indicator />
            </Tabs.Tab>
            <Tabs.Tab id="players">
              Players
              <Tabs.Indicator />
            </Tabs.Tab>
            <Tabs.Tab id="finance">
              Finance
              <Tabs.Indicator />
            </Tabs.Tab>
          </Tabs.List>
        </Tabs.ListContainer>
        <Tabs.Panel id="games">
          <div className="dash-grid">
            <Card>
              <Card.Header>
                <div className="incoming-title">
                  <Card.Title>Incoming games</Card.Title>
                  {data && data.incoming.length > 0 ? (
                    <img
                      className="incoming-alert"
                      src="/incoming-alert.gif"
                      alt=""
                    />
                  ) : null}
                </div>
              </Card.Header>
              <Card.Content>
                {data && data.incoming.length === 0 ? (
                  <p className="muted">Nothing scheduled.</p>
                ) : null}
                <ul className="dash-list">
                  {data?.incoming.map((event) => (
                    <li key={event.id}>
                      <strong>
                        {formatEventWhen(event.date, event.startTime)}
                      </strong>
                      <span className="muted">
                        {event.opponent || "Match"} · {event.location}
                      </span>
                    </li>
                  ))}
                </ul>
              </Card.Content>
            </Card>
            <Card>
              <Card.Header>
                <Card.Title>Past results</Card.Title>
              </Card.Header>
              <Card.Content>
                {data && data.pastResults.length === 0 ? (
                  <p className="muted">No results yet.</p>
                ) : null}
                <ul className="dash-list">
                  {data?.pastResults.map((event) => (
                    <li key={event.id}>
                      <strong>{event.opponent || "Match"}</strong>
                      <span className="muted">
                        {event.scoreFor}–{event.scoreAgainst} · {event.result}
                      </span>
                    </li>
                  ))}
                </ul>
              </Card.Content>
            </Card>
            <Card>
              <Card.Header>
                <Card.Title>Win/loss ratio</Card.Title>
              </Card.Header>
              <Card.Content>
                <WinLossChart
                  wins={data?.wins ?? 0}
                  losses={data?.losses ?? 0}
                />
              </Card.Content>
            </Card>
          </div>
        </Tabs.Panel>
        <Tabs.Panel id="players">
          <div className="dash-grid">
            <Card>
              <Card.Header>
                <Card.Title>Top scorers</Card.Title>
                <Card.Description>
                  The three players with the most goals.
                </Card.Description>
              </Card.Header>
              <Card.Content>
                <StatList
                  rows={data?.topScorers ?? []}
                  empty="No goals recorded yet."
                  unit="goals"
                />
              </Card.Content>
            </Card>
            <Card>
              <Card.Header>
                <Card.Title>Top assists</Card.Title>
                <Card.Description>
                  The three players with the most assists.
                </Card.Description>
              </Card.Header>
              <Card.Content>
                <StatList
                  rows={data?.topAssists ?? []}
                  empty="No assists recorded yet."
                  unit="assists"
                />
              </Card.Content>
            </Card>
            <Card>
              <Card.Header>
                <Card.Title>Injury update</Card.Title>
              </Card.Header>
              <Card.Content>
                {data && data.injured.length === 0 ? (
                  <p className="muted">No injured players.</p>
                ) : null}
                <ul className="dash-list">
                  {data?.injured.map((player) => (
                    <li key={player.id}>{injuryUpdateLabel(player)}</li>
                  ))}
                </ul>
              </Card.Content>
            </Card>
          </div>
        </Tabs.Panel>
        <Tabs.Panel id="finance">
          <div className="dash-grid">
            <Card>
              <Card.Header>
                <Card.Title>Account balance</Card.Title>
              </Card.Header>
              <Card.Content>
                <p className="dash-figure">{data ? data.balance : "–"}</p>
              </Card.Content>
            </Card>
            <Card>
              <Card.Header>
                <Card.Title>Income</Card.Title>
              </Card.Header>
              <Card.Content>
                <p className="dash-figure money-in">
                  {data ? data.income : "–"}
                </p>
              </Card.Content>
            </Card>
            <Card>
              <Card.Header>
                <Card.Title>Expense</Card.Title>
              </Card.Header>
              <Card.Content>
                <p className="dash-figure money-out">
                  {data ? data.expense : "–"}
                </p>
              </Card.Content>
            </Card>
          </div>
        </Tabs.Panel>
      </Tabs>
    </div>
  );
}

function StatList({
  rows,
  empty,
  unit,
}: {
  rows: { id: string; name: string; total: number }[];
  empty: string;
  unit: string;
}) {
  if (rows.length === 0) return <p className="muted">{empty}</p>;
  return (
    <ol className="dash-list">
      {rows.map((row) => (
        <li key={row.id}>
          <strong>{row.name}</strong>
          <span className="muted">
            {row.total} {unit}
          </span>
        </li>
      ))}
    </ol>
  );
}

function WinLossChart({ wins, losses }: { wins: number; losses: number }) {
  if (wins + losses === 0)
    return <p className="muted">No wins or losses yet.</p>;
  return (
    <div className="dash-chart" data-testid="win-loss-chart">
      <Doughnut
        data={{
          labels: ["Wins", "Losses"],
          datasets: [
            {
              data: [wins, losses],
              backgroundColor: ["#1aae39", "#dd5b00"],
              borderWidth: 0,
            },
          ],
        }}
        options={{ plugins: { legend: { position: "bottom" } } }}
      />
    </div>
  );
}
