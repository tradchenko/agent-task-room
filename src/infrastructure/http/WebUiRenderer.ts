function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export class WebUiRenderer {
  public render(): string {
    return `<!doctype html>
<html lang="ru">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml('agent-task-room')}</title>
    <style>
      :root {
        --bg: #f5f1e8;
        --panel: #fffdf8;
        --line: #e4d9c6;
        --ink: #211d18;
        --muted: #6c6458;
        --accent: #0f766e;
        --danger: #b91c1c;
        --warning: #a16207;
        --radius: 18px;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: Georgia, "Times New Roman", serif;
        color: var(--ink);
        background:
          radial-gradient(circle at top left, rgba(15, 118, 110, 0.12), transparent 30%),
          radial-gradient(circle at top right, rgba(161, 98, 7, 0.10), transparent 28%),
          var(--bg);
      }
      .page {
        width: min(1280px, calc(100vw - 32px));
        margin: 0 auto;
        padding: 24px 0 40px;
      }
      .hero {
        margin-bottom: 20px;
      }
      .hero h1 {
        margin: 0 0 8px;
        font-size: clamp(32px, 5vw, 52px);
        line-height: 0.95;
      }
      .hero p {
        margin: 0;
        max-width: 840px;
        color: var(--muted);
        font-size: 18px;
      }
      .layout {
        display: grid;
        grid-template-columns: 340px minmax(0, 1fr);
        gap: 20px;
      }
      .stack {
        display: grid;
        gap: 16px;
      }
      .panel {
        background: rgba(255, 253, 248, 0.94);
        border: 1px solid var(--line);
        border-radius: var(--radius);
        padding: 18px;
      }
      .panel h2,
      .panel h3 {
        margin: 0 0 12px;
      }
      .muted { color: var(--muted); }
      .mono { font-family: "SFMono-Regular", Consolas, monospace; }
      .room-list,
      .message-list,
      .kv {
        display: grid;
        gap: 10px;
      }
      .room-link,
      .message,
      .card {
        display: block;
        padding: 12px;
        border-radius: 14px;
        border: 1px solid var(--line);
        background: #fff;
        text-decoration: none;
        color: inherit;
      }
      input,
      textarea,
      button {
        width: 100%;
        font: inherit;
      }
      select {
        width: 100%;
        font: inherit;
        padding: 10px 12px;
        border: 1px solid var(--line);
        border-radius: 12px;
        background: #fff;
      }
      input,
      textarea {
        padding: 10px 12px;
        border: 1px solid var(--line);
        border-radius: 12px;
        background: #fff;
      }
      textarea { min-height: 110px; resize: vertical; }
      button {
        border: 0;
        border-radius: 12px;
        padding: 11px 14px;
        color: #fff;
        background: var(--accent);
        cursor: pointer;
        font-weight: 700;
      }
      button.warning { background: var(--warning); }
      button.danger { background: var(--danger); }
      button:disabled {
        opacity: 0.6;
        cursor: default;
      }
      .button-row {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 10px;
      }
      .button-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 10px;
      }
      .inline-row {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto auto;
        gap: 10px;
      }
      .status {
        display: inline-flex;
        padding: 8px 12px;
        border-radius: 999px;
        background: rgba(15, 118, 110, 0.14);
        color: var(--accent);
        font-weight: 700;
      }
      .lead {
        font-size: 18px;
      }
      .callout {
        padding: 14px;
        border-radius: 14px;
        border: 1px solid var(--line);
        background: rgba(255, 255, 255, 0.85);
      }
      pre {
        margin: 0;
        white-space: pre-wrap;
        overflow-wrap: anywhere;
      }
      .empty {
        padding: 14px;
        border: 1px dashed var(--line);
        border-radius: 14px;
        color: var(--muted);
      }
      details.panel {
        padding-bottom: 12px;
      }
      details > summary {
        cursor: pointer;
        font-weight: 700;
        list-style: none;
      }
      details > summary::-webkit-details-marker {
        display: none;
      }
      details > summary::after {
        content: 'Развернуть';
        float: right;
        color: var(--muted);
        font-weight: 400;
      }
      details[open] > summary::after {
        content: 'Свернуть';
      }
      .subsection {
        margin-top: 14px;
      }
      @media (max-width: 980px) {
        .layout { grid-template-columns: 1fr; }
        .button-row,
        .button-grid { grid-template-columns: 1fr; }
      }
    </style>
  </head>
  <body>
    <div class="page">
      <div class="hero">
        <h1>Общая комната задачи для двух людей и двух агентов</h1>
        <p>Один участник поднимает сессию, передаёт второму ссылку, а дальше обе стороны видят одну и ту же ленту, решения и следующий шаг.</p>
      </div>

      <div class="layout">
        <div class="stack">
          <section class="panel">
            <h2>Доступ</h2>
            <div class="kv">
              <input id="tokenInput" placeholder="Вставь токен, если сервер защищён" />
              <button id="saveTokenButton">Сохранить токен</button>
              <div id="authStatus" class="muted">Токен можно вставить из ссылки или из вывода команды session.</div>
            </div>
          </section>

          <section class="panel">
            <h2>Комнаты</h2>
            <div class="kv" style="margin-bottom: 12px;">
              <div class="inline-row">
                <input id="roomSearchInput" placeholder="Поиск по задачам, сообщениям, артефактам и решениям" />
                <button id="roomSearchButton">Найти</button>
                <button id="roomSearchClearButton" class="warning">Сбросить</button>
              </div>
            </div>
            <div id="roomList" class="room-list"></div>
          </section>

          <details class="panel">
            <summary>Технические детали</summary>
            <div class="subsection">
              <div id="launchInfo" class="kv"></div>
            </div>
          </details>
        </div>

        <div class="stack">
          <section class="panel" id="invitePanel">
            <h2 id="inviteTitle">Быстрый старт</h2>
            <div id="inviteDescription" class="lead muted">
              Запусти локально session, затем открой ссылку владельца и передай invite-ссылку второму участнику.
            </div>
            <div style="height: 14px"></div>
            <div class="callout">
              <div class="muted" style="margin-bottom: 8px;">Что делает человек</div>
              <ol id="humanStepsList" style="margin: 0; padding-left: 18px;"></ol>
            </div>
            <div style="height: 14px"></div>
            <div class="button-grid">
              <button id="joinRoomButton">Подключиться к комнате</button>
              <button id="copyAgentPromptButton">Скопировать инструкцию для моего агента</button>
              <button id="copyPeerInviteButton">Скопировать ссылку второму участнику</button>
            </div>
            <div style="height: 12px"></div>
            <div id="inviteStatus" class="muted">Здесь появится подсказка по текущему шагу.</div>
            <div style="height: 12px"></div>
            <div class="callout">
              <div class="muted" style="margin-bottom: 8px;">Что вставить в чат агента</div>
              <pre id="agentPromptPreview">Инструкция для агента появится после выбора комнаты или открытия invite-ссылки.</pre>
            </div>
          </section>

          <section class="panel">
            <div class="muted mono" id="roomPath">/</div>
            <div style="height: 8px"></div>
            <div class="status" id="statusPill">Ожидание</div>
            <div style="height: 12px"></div>
            <h2 id="roomTitle">Комната не выбрана</h2>
            <div id="roomMeta" class="kv"></div>
          </section>

          <section class="panel">
            <h2>Что делать дальше</h2>
            <div id="statusReason" class="card muted">Выбери комнату или открой invite-ссылку, чтобы увидеть следующий шаг.</div>
          </section>

          <section class="panel">
            <h2>Общее сообщение для обоих участников</h2>
            <div class="kv">
              <input id="humanLabelInput" value="Coordinator" placeholder="Кто пишет" />
              <input id="messageTitleInput" value="Новая вводная" placeholder="Заголовок" />
              <input id="messageRefsInput" placeholder="Refs через запятую" />
              <textarea id="messageBodyInput" placeholder="Сообщение сразу для обоих людей и обоих агентов"></textarea>
              <button id="sendMessageButton">Отправить в общую ленту</button>
            </div>
          </section>

          <section class="panel">
            <h2>Лента комнаты</h2>
            <div id="messageList" class="message-list"></div>
          </section>

          <details class="panel">
            <summary>Расширенные действия</summary>
            <div class="subsection kv">
              <div class="button-grid">
                <button id="quickActionRequestContextButton">Попросить контекст</button>
                <button id="quickActionRequestRecheckButton" class="warning">Запросить перепроверку</button>
                <button id="quickActionRequestDecisionButton">Попросить свести решение</button>
                <button id="quickActionRequestFinalPositionsButton">Попросить финальные позиции</button>
                <button id="quickActionCopyRoomLinkButton">Скопировать ссылку на комнату</button>
                <button id="quickActionCopyJoinCommandButton">Скопировать CLI join</button>
                <button id="quickActionCopyPeerPromptButton">Скопировать prompt коллеге</button>
                <button id="quickActionCopyWatchEnvelopeButton">Скопировать A2A watch</button>
              </div>
              <div id="quickActionStatus" class="muted">Здесь появится результат быстрого действия.</div>
            </div>
          </details>

          <details class="panel">
            <summary>Артефакты, решения и итог людей</summary>
            <div class="subsection stack">
              <section>
                <h3>Добавить артефакт</h3>
                <div class="kv">
                  <select id="artifactKindInput">
                    <option value="jira_issue">Jira Issue</option>
                    <option value="github_issue">GitHub Issue</option>
                    <option value="github_pr">GitHub PR</option>
                    <option value="link">Ссылка</option>
                    <option value="log">Лог</option>
                    <option value="diff">Diff</option>
                    <option value="note">Заметка</option>
                  </select>
                  <input id="artifactTitleInput" placeholder="Название артефакта" />
                  <input id="artifactUriInput" placeholder="URL или внешний путь" />
                  <input id="artifactTagsInput" placeholder="Теги через запятую" />
                  <textarea id="artifactSummaryInput" placeholder="Краткое описание или содержимое артефакта"></textarea>
                  <button id="addArtifactButton">Добавить артефакт</button>
                </div>
              </section>

              <section>
                <h3>Записать решение</h3>
                <div class="kv">
                  <input id="decisionTitleInput" placeholder="Короткое название решения" />
                  <select id="decisionStatusInput">
                    <option value="proposed">proposed</option>
                    <option value="accepted">accepted</option>
                    <option value="rejected">rejected</option>
                    <option value="superseded">superseded</option>
                  </select>
                  <input id="decisionRefsInput" placeholder="Refs через запятую" />
                  <textarea id="decisionSummaryInput" placeholder="Суть решения"></textarea>
                  <textarea id="decisionRationaleInput" placeholder="Почему это решение выглядит правильным"></textarea>
                  <button id="addDecisionButton">Записать в decision log</button>
                </div>
              </section>

              <section>
                <h3>Решение людей</h3>
                <div class="kv">
                  <textarea id="verdictCommentInput" placeholder="Короткий комментарий к решению"></textarea>
                  <div class="button-row">
                    <button id="approveButton">Подтвердить</button>
                    <button id="keepActiveButton" class="warning">Продолжить сессию</button>
                    <button id="rejectButton" class="danger">Отклонить</button>
                  </div>
                </div>
              </section>
            </div>
          </details>

          <details class="panel">
            <summary>История и служебные данные</summary>
            <div class="subsection stack">
              <section>
                <h3>Артефакты</h3>
                <div id="artifactList" class="message-list"></div>
              </section>

              <section>
                <h3>Decision Log</h3>
                <div id="decisionList" class="message-list"></div>
              </section>

              <section>
                <h3>История комнаты</h3>
                <div id="historyList" class="message-list"></div>
              </section>
            </div>
          </details>
        </div>
      </div>
    </div>

    <script type="module" src="/assets/task-room-ui.js"></script>
  </body>
</html>`;
  }
}
