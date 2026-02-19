const addPlayerButton = document.getElementById('add-player-button');
const list = document.getElementById('initiative-list');
const sortButton = document.getElementById('sort-button');
const exportButton = document.getElementById('export-button');
const importButton = document.getElementById('import-button');
const importFileInput = document.getElementById('import-file-input');
const STORAGE_KEY = 'dnd-battle-tracker-state-v1';
const APP_STATE_VERSION = 1;

const players = [];
let nextPlayerId = 1;

function buildAppState() {
  return {
    version: APP_STATE_VERSION,
    initiative: {
      players,
      nextPlayerId,
    },
  };
}

function saveState() {
  const appState = buildAppState();

  localStorage.setItem(STORAGE_KEY, JSON.stringify(appState));
}

function normalizeInitiativeState(rawInitiativeState) {
  if (!rawInitiativeState || !Array.isArray(rawInitiativeState.players)) {
    return null;
  }

  const restoredPlayers = rawInitiativeState.players
    .filter((player) => player && Number.isInteger(player.id))
    .map((player) => ({
      id: player.id,
      name: typeof player.name === 'string' ? player.name : '',
      initiative: typeof player.initiative === 'string' ? player.initiative : String(player.initiative ?? ''),
    }));

  const maxId = restoredPlayers.reduce((maxValue, player) => Math.max(maxValue, player.id), 0);
  const restoredNextPlayerId = Number.isInteger(rawInitiativeState.nextPlayerId)
    ? Math.max(rawInitiativeState.nextPlayerId, maxId + 1)
    : maxId + 1;

  return {
    players: restoredPlayers,
    nextPlayerId: restoredNextPlayerId,
  };
}

function normalizeAppState(rawAppState) {
  if (!rawAppState || typeof rawAppState !== 'object') {
    return null;
  }

  if (rawAppState.initiative) {
    const normalizedInitiative = normalizeInitiativeState(rawAppState.initiative);
    if (!normalizedInitiative) {
      return null;
    }

    return {
      version: Number.isInteger(rawAppState.version) ? rawAppState.version : APP_STATE_VERSION,
      initiative: normalizedInitiative,
    };
  }

  const legacyInitiative = normalizeInitiativeState(rawAppState);
  if (!legacyInitiative) {
    return null;
  }

  return {
    version: APP_STATE_VERSION,
    initiative: legacyInitiative,
  };
}

function applyAppState(appState) {
  players.splice(0, players.length, ...appState.initiative.players);
  nextPlayerId = appState.initiative.nextPlayerId;
}

function loadState() {
  const rawState = localStorage.getItem(STORAGE_KEY);
  if (!rawState) {
    return;
  }

  try {
    const parsedAppState = JSON.parse(rawState);
    const normalizedAppState = normalizeAppState(parsedAppState);
    if (!normalizedAppState) {
      return;
    }

    applyAppState(normalizedAppState);
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }
}

function exportStateToJsonFile() {
  const exportData = {
    ...buildAppState(),
    exportedAt: new Date().toISOString(),
  };

  const jsonBlob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
  const downloadUrl = URL.createObjectURL(jsonBlob);
  const downloadLink = document.createElement('a');
  downloadLink.href = downloadUrl;
  downloadLink.download = 'dnd-battle-tracker-backup.json';
  document.body.appendChild(downloadLink);
  downloadLink.click();
  document.body.removeChild(downloadLink);
  URL.revokeObjectURL(downloadUrl);
}

function importStateFromJsonFile(file) {
  const reader = new FileReader();

  reader.addEventListener('load', () => {
    try {
      const parsedState = JSON.parse(String(reader.result));
      const normalizedState = normalizeAppState(parsedState);

      if (!normalizedState) {
        alert('Niepoprawny plik JSON.');
        return;
      }

      applyAppState(normalizedState);
      saveState();
      renderList();
    } catch {
      alert('Nie udało się odczytać pliku JSON.');
    }
  });

  reader.readAsText(file);
}

function syncPlayersOrderFromDom() {
  const idOrder = Array.from(list.children).map((item) => Number.parseInt(item.dataset.id, 10));
  const orderedPlayers = idOrder
    .map((id) => players.find((player) => player.id === id))
    .filter(Boolean);

  if (orderedPlayers.length === players.length) {
    players.splice(0, players.length, ...orderedPlayers);
    saveState();
  }
}

function getDragAfterElement(container, yPosition) {
  const draggableItems = [...container.querySelectorAll('.initiative-item:not(.is-dragging)')];

  return draggableItems.reduce(
    (closest, child) => {
      const box = child.getBoundingClientRect();
      const offset = yPosition - box.top - box.height / 2;

      if (offset < 0 && offset > closest.offset) {
        return { offset, element: child };
      }

      return closest;
    },
    { offset: Number.NEGATIVE_INFINITY, element: null },
  ).element;
}

function renderList() {
  list.innerHTML = '';

  players.forEach((player) => {
    const item = document.createElement('li');
    item.className = 'initiative-item';
    item.draggable = true;
    item.dataset.id = String(player.id);

    const dragHandle = document.createElement('span');
    dragHandle.className = 'drag-handle';
    dragHandle.textContent = '⋮⋮';

    const scoreInput = document.createElement('input');
    scoreInput.className = 'initiative-score-input';
    scoreInput.type = 'number';
    scoreInput.placeholder = '00';
    scoreInput.value = player.initiative;
    scoreInput.addEventListener('input', (event) => {
      const value = event.target.value;
      player.initiative = value;
      saveState();
    });

    const nameInput = document.createElement('input');
    nameInput.className = 'initiative-name-input';
    nameInput.type = 'text';
    nameInput.placeholder = 'Imię / nazwa';
    nameInput.value = player.name;
    nameInput.addEventListener('input', (event) => {
      player.name = event.target.value;
      saveState();
    });

    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.className = 'delete-btn';
    removeButton.textContent = '🗑';
    removeButton.setAttribute('aria-label', 'Usuń element');
    removeButton.addEventListener('click', () => {
      const playerIndex = players.findIndex((listPlayer) => listPlayer.id === player.id);
      if (playerIndex !== -1) {
        players.splice(playerIndex, 1);
      }
      saveState();
      renderList();
    });

    item.addEventListener('dragstart', () => {
      item.classList.add('is-dragging');
    });

    item.addEventListener('dragend', () => {
      item.classList.remove('is-dragging');
      syncPlayersOrderFromDom();
    });

    item.append(dragHandle, scoreInput, nameInput, removeButton);
    list.appendChild(item);
  });
}

addPlayerButton.addEventListener('click', () => {
  players.push({ id: nextPlayerId, name: '', initiative: '' });
  nextPlayerId += 1;
  saveState();
  renderList();
});

list.addEventListener('dragover', (event) => {
  event.preventDefault();
  const afterElement = getDragAfterElement(list, event.clientY);
  const draggingItem = list.querySelector('.initiative-item.is-dragging');

  if (!draggingItem) {
    return;
  }

  if (!afterElement) {
    list.appendChild(draggingItem);
  } else {
    list.insertBefore(draggingItem, afterElement);
  }
});

list.addEventListener('drop', (event) => {
  event.preventDefault();
  syncPlayersOrderFromDom();
});

sortButton.addEventListener('click', () => {
  players.sort((a, b) => {
    const initiativeA = Number.parseInt(a.initiative, 10);
    const initiativeB = Number.parseInt(b.initiative, 10);
    const safeInitiativeA = Number.isNaN(initiativeA) ? Number.NEGATIVE_INFINITY : initiativeA;
    const safeInitiativeB = Number.isNaN(initiativeB) ? Number.NEGATIVE_INFINITY : initiativeB;
    return safeInitiativeB - safeInitiativeA;
  });
  saveState();
  renderList();
});

exportButton.addEventListener('click', () => {
  exportStateToJsonFile();
});

importButton.addEventListener('click', () => {
  importFileInput.click();
});

importFileInput.addEventListener('change', (event) => {
  const [file] = event.target.files ?? [];
  if (!file) {
    return;
  }

  importStateFromJsonFile(file);
  importFileInput.value = '';
});

loadState();
renderList();
