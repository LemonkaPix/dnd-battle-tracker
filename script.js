const addPlayerButton = document.getElementById('add-player-button');
const addCharacterButton = document.getElementById('add-character-button');
const list = document.getElementById('initiative-list');
const characterCardsContainer = document.getElementById('character-cards');
const timeList = document.getElementById('time-list');
const sortButton = document.getElementById('sort-button');
const exportButton = document.getElementById('export-button');
const importButton = document.getElementById('import-button');
const importFileInput = document.getElementById('import-file-input');
const conditionDialog = document.getElementById('condition-dialog');
const conditionDialogOptions = document.getElementById('condition-dialog-options');
const STORAGE_KEY = 'dnd-battle-tracker-state-v1';
const APP_STATE_VERSION = 1;
const CONDITION_OPTIONS = [
  'Blinded',
  'Charmed',
  'Deafened',
  'Exhaustion',
  'Frightened',
  'Grappled',
  'Incapacitated',
  'Invisible',
  'Paralyzed',
  'Petrified',
  'Poisoned',
  'Prone',
  'Restrained',
  'Stunned',
  'Unconscious',
];

const players = [];
const characterCards = [];
let nextPlayerId = 1;
let nextCharacterId = 1;
let currentHour = null;
let selectedConditionCharacterId = null;

function buildAppState() {
  return {
    version: APP_STATE_VERSION,
    initiative: {
      players,
      nextPlayerId,
    },
    characters: {
      cards: characterCards,
      nextCharacterId,
    },
    time: {
      currentHour,
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

function normalizeTimeState(rawTimeState) {
  if (!rawTimeState || typeof rawTimeState !== 'object') {
    return {
      currentHour: null,
    };
  }

  const parsedHour = Number.parseInt(rawTimeState.currentHour, 10);
  const normalizedHour = parsedHour >= 0 && parsedHour <= 23 ? parsedHour : null;

  return {
    currentHour: normalizedHour,
  };
}

function normalizeCharacterState(rawCharacterState) {
  if (!rawCharacterState || !Array.isArray(rawCharacterState.cards)) {
    return {
      cards: [],
      nextCharacterId: 1,
    };
  }

  const restoredCards = rawCharacterState.cards
    .filter((card) => card && Number.isInteger(card.id))
    .map((card) => {
      const cardConditions = Array.isArray(card.conditions)
        ? card.conditions.filter((condition) => CONDITION_OPTIONS.includes(condition))
        : [];

      return {
        id: card.id,
        level: typeof card.level === 'string' ? card.level : String(card.level ?? ''),
        name: typeof card.name === 'string' ? card.name : '',
        hp: typeof card.hp === 'string' ? card.hp : String(card.hp ?? ''),
        maxHp: typeof card.maxHp === 'string' ? card.maxHp : String(card.maxHp ?? ''),
        ac: typeof card.ac === 'string' ? card.ac : String(card.ac ?? ''),
        passivePerception:
          typeof card.passivePerception === 'string'
            ? card.passivePerception
            : String(card.passivePerception ?? ''),
        inspiration:
          typeof card.inspiration === 'string'
            ? card.inspiration
            : card.inspiration === true
              ? '1'
              : String(card.inspiration ?? ''),
        notes: typeof card.notes === 'string' ? card.notes : '',
        notesHeight: typeof card.notesHeight === 'string' ? card.notesHeight : '',
        conditions: [...new Set(cardConditions)],
      };
    });

  const maxCardId = restoredCards.reduce((maxValue, card) => Math.max(maxValue, card.id), 0);
  const restoredNextCharacterId = Number.isInteger(rawCharacterState.nextCharacterId)
    ? Math.max(rawCharacterState.nextCharacterId, maxCardId + 1)
    : maxCardId + 1;

  return {
    cards: restoredCards,
    nextCharacterId: restoredNextCharacterId,
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

    const normalizedTime = normalizeTimeState(rawAppState.time);
    const normalizedCharacters = normalizeCharacterState(rawAppState.characters);

    return {
      version: Number.isInteger(rawAppState.version) ? rawAppState.version : APP_STATE_VERSION,
      initiative: normalizedInitiative,
      characters: normalizedCharacters,
      time: normalizedTime,
    };
  }

  const legacyInitiative = normalizeInitiativeState(rawAppState);
  if (!legacyInitiative) {
    return null;
  }

  return {
    version: APP_STATE_VERSION,
    initiative: legacyInitiative,
    characters: normalizeCharacterState(rawAppState.characters),
    time: normalizeTimeState(rawAppState.time),
  };
}

function applyAppState(appState) {
  players.splice(0, players.length, ...appState.initiative.players);
  nextPlayerId = appState.initiative.nextPlayerId;
  characterCards.splice(0, characterCards.length, ...appState.characters.cards);
  nextCharacterId = appState.characters.nextCharacterId;
  currentHour = appState.time.currentHour;
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
      renderAll();
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

function moveCardLeft(cardId) {
  const currentIndex = characterCards.findIndex((card) => card.id === cardId);
  if (currentIndex > 0) {
    const temp = characterCards[currentIndex];
    characterCards[currentIndex] = characterCards[currentIndex - 1];
    characterCards[currentIndex - 1] = temp;
    saveState();
    renderCharacterCards();
  }
}

function moveCardRight(cardId) {
  const currentIndex = characterCards.findIndex((card) => card.id === cardId);
  if (currentIndex < characterCards.length - 1) {
    const temp = characterCards[currentIndex];
    characterCards[currentIndex] = characterCards[currentIndex + 1];
    characterCards[currentIndex + 1] = temp;
    saveState();
    renderCharacterCards();
  }
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

function renderTimeList() {
  timeList.innerHTML = '';

  for (let hour = 0; hour < 24; hour += 1) {
    const listItem = document.createElement('li');

    const label = document.createElement('label');
    label.className = 'time-item-label';

    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = 'current-hour';
    radio.value = String(hour);
    radio.className = 'time-item-radio';
    radio.checked = currentHour === hour;

    radio.addEventListener('change', () => {
      if (radio.checked) {
        currentHour = hour;
        saveState();
      }
    });

    const hourText = document.createElement('span');
    hourText.className = 'time-item-hour';
    hourText.textContent = `${String(hour).padStart(2, '0')}:00`;

    label.append(radio, hourText);
    listItem.appendChild(label);
    timeList.appendChild(listItem);
  }
}

function renderCharacterCards() {
  characterCardsContainer.innerHTML = '';

  characterCards.forEach((card) => {
    const parseCardInteger = (value) => {
      const parsedValue = Number.parseInt(value, 10);
      return Number.isNaN(parsedValue) ? null : parsedValue;
    };

    const getConditionTagClassName = (conditionName) => {
      const colorIndex = CONDITION_OPTIONS.indexOf(conditionName) % 6;
      return `condition-tag color-${colorIndex >= 0 ? colorIndex : 0}`;
    };

    const cardElement = document.createElement('article');
    cardElement.className = 'character-card';
    cardElement.dataset.id = String(card.id);

    const cardControls = document.createElement('div');
    cardControls.className = 'card-controls';

    const leftArrow = document.createElement('button');
    leftArrow.type = 'button';
    leftArrow.className = 'card-arrow-btn';
    leftArrow.textContent = '←';
    leftArrow.setAttribute('aria-label', 'Przesuń w lewo');
    leftArrow.addEventListener('click', () => moveCardLeft(card.id));

    const rightArrow = document.createElement('button');
    rightArrow.type = 'button';
    rightArrow.className = 'card-arrow-btn';
    rightArrow.textContent = '→';
    rightArrow.setAttribute('aria-label', 'Przesuń w prawo');
    rightArrow.addEventListener('click', () => moveCardRight(card.id));

    cardControls.append(leftArrow, rightArrow);

    const topRow = document.createElement('div');
    topRow.className = 'character-top-row';

    const levelRow = document.createElement('div');
    levelRow.className = 'character-row character-row-level';
    const levelLabel = document.createElement('label');
    levelLabel.textContent = 'Poziom';
    const levelInput = document.createElement('input');
    levelInput.className = 'character-input character-level-input';
    levelInput.type = 'number';
    levelInput.placeholder = '1';
    levelInput.value = card.level;
    levelInput.addEventListener('input', (event) => {
      card.level = event.target.value;
      saveState();
    });
    levelRow.append(levelLabel, levelInput);

    const nameRow = document.createElement('div');
    nameRow.className = 'character-row';
    const nameLabel = document.createElement('label');
    nameLabel.textContent = 'Imię';
    const nameInput = document.createElement('input');
    nameInput.className = 'character-input';
    nameInput.type = 'text';
    nameInput.placeholder = 'Imię postaci';
    nameInput.value = card.name;
    nameInput.addEventListener('input', (event) => {
      card.name = event.target.value;
      saveState();
    });
    nameRow.append(nameLabel, nameInput);
    topRow.append(levelRow, nameRow, cardControls);

    const hpRow = document.createElement('div');
    hpRow.className = 'character-row hp-row';
    const hpLabel = document.createElement('label');
    hpLabel.textContent = 'HP';

    const hpMainRow = document.createElement('div');
    hpMainRow.className = 'hp-main-row';

    const hpInput = document.createElement('input');
    hpInput.className = 'character-input hp-value-input';
    hpInput.type = 'number';
    hpInput.placeholder = 'HP';
    hpInput.value = card.hp;
    hpInput.addEventListener('input', (event) => {
      card.hp = event.target.value;
      saveState();
    });

    const hpSeparator = document.createElement('span');
    hpSeparator.className = 'hp-separator';
    hpSeparator.textContent = '/';

    const maxHpInput = document.createElement('input');
    maxHpInput.className = 'character-input hp-value-input';
    maxHpInput.type = 'number';
    maxHpInput.placeholder = 'Max';
    maxHpInput.value = card.maxHp;
    maxHpInput.addEventListener('input', (event) => {
      card.maxHp = event.target.value;
      const parsedCurrentHp = parseCardInteger(card.hp);
      const parsedMaxHp = parseCardInteger(card.maxHp);

      if (parsedCurrentHp !== null && parsedMaxHp !== null && parsedCurrentHp > parsedMaxHp) {
        card.hp = String(parsedMaxHp);
        hpInput.value = card.hp;
      }

      saveState();
    });

    hpMainRow.append(hpInput, hpSeparator, maxHpInput);

    const hpActionRow = document.createElement('div');
    hpActionRow.className = 'hp-action-row';

    const hpActionInput = document.createElement('input');
    hpActionInput.className = 'character-input hp-action-input';
    hpActionInput.type = 'number';
    hpActionInput.placeholder = 'Wartość';

    const addHpButton = document.createElement('button');
    addHpButton.type = 'button';
    addHpButton.className = 'hp-action-button';
    addHpButton.textContent = '+HP';

    const removeHpButton = document.createElement('button');
    removeHpButton.type = 'button';
    removeHpButton.className = 'hp-action-button';
    removeHpButton.textContent = '-HP';

    const applyHpChange = (direction) => {
      const changeValue = parseCardInteger(hpActionInput.value);
      if (changeValue === null || changeValue <= 0) {
        return;
      }

      const currentHp = parseCardInteger(card.hp) ?? 0;
      const maxHp = parseCardInteger(card.maxHp);
      let nextHp = direction === 'add' ? currentHp + changeValue : currentHp - changeValue;

      if (maxHp !== null) {
        nextHp = Math.min(nextHp, maxHp);
      }

      nextHp = Math.max(nextHp, 0);
      card.hp = String(nextHp);
      hpInput.value = card.hp;
      saveState();
    };

    addHpButton.addEventListener('click', () => {
      applyHpChange('add');
    });

    removeHpButton.addEventListener('click', () => {
      applyHpChange('remove');
    });

    hpActionRow.append(hpActionInput, addHpButton, removeHpButton);
    hpRow.append(hpLabel, hpMainRow, hpActionRow);

    const statsGrid = document.createElement('div');
    statsGrid.className = 'character-grid character-stats-grid';

    const acRow = document.createElement('div');
    acRow.className = 'character-row';
    const acLabel = document.createElement('label');
    acLabel.textContent = 'AC';
    const acInput = document.createElement('input');
    acInput.className = 'character-input';
    acInput.type = 'number';
    acInput.placeholder = 'AC';
    acInput.value = card.ac;
    acInput.addEventListener('input', (event) => {
      card.ac = event.target.value;
      saveState();
    });
    acRow.append(acLabel, acInput);

    const ppRow = document.createElement('div');
    ppRow.className = 'character-row';
    const ppLabel = document.createElement('label');
    ppLabel.textContent = 'PP';
    const ppInput = document.createElement('input');
    ppInput.className = 'character-input';
    ppInput.type = 'number';
    ppInput.placeholder = 'PP';
    ppInput.value = card.passivePerception;
    ppInput.addEventListener('input', (event) => {
      card.passivePerception = event.target.value;
      saveState();
    });
    ppRow.append(ppLabel, ppInput);

    const inspirationRow = document.createElement('div');
    inspirationRow.className = 'character-row';
    const inspirationLabel = document.createElement('label');
    inspirationLabel.textContent = 'Inspiration';
    const inspirationInput = document.createElement('input');
    inspirationInput.className = 'character-input';
    inspirationInput.type = 'number';
    inspirationInput.placeholder = '0';
    inspirationInput.value = card.inspiration;
    inspirationInput.addEventListener('input', (event) => {
      card.inspiration = event.target.value;
      saveState();
    });
    inspirationRow.append(inspirationLabel, inspirationInput);

    statsGrid.append(acRow, ppRow, inspirationRow);

    const notesRow = document.createElement('div');
    notesRow.className = 'character-row';
    const notesLabel = document.createElement('label');
    notesLabel.textContent = 'Notatki';
    const notesInput = document.createElement('textarea');
    notesInput.className = 'character-textarea';
    notesInput.value = card.notes;
    notesInput.spellcheck = false;

    if (card.notesHeight) {
      notesInput.style.height = card.notesHeight;
    }

    const saveNotesHeight = () => {
      card.notesHeight = notesInput.style.height || `${notesInput.offsetHeight}px`;
      saveState();
    };

    notesInput.addEventListener('input', (event) => {
      card.notes = event.target.value;
      saveState();
    });
    notesInput.addEventListener('mouseup', saveNotesHeight);
    notesInput.addEventListener('keyup', saveNotesHeight);
    notesInput.addEventListener('blur', saveNotesHeight);
    notesRow.append(notesLabel, notesInput);

    const conditionsSection = document.createElement('div');
    conditionsSection.className = 'conditions';

    const conditionsHeader = document.createElement('div');
    conditionsHeader.className = 'conditions-header';

    const conditionsTitle = document.createElement('span');
    conditionsTitle.className = 'conditions-title';
    conditionsTitle.textContent = 'Conditions';

    const addConditionButton = document.createElement('button');
    addConditionButton.type = 'button';
    addConditionButton.className = 'add-condition-button';
    addConditionButton.textContent = '+';

    conditionsHeader.append(conditionsTitle, addConditionButton);

    addConditionButton.addEventListener('click', () => {
      const availableConditions = CONDITION_OPTIONS.filter((conditionName) => !card.conditions.includes(conditionName));
      if (availableConditions.length === 0) {
        alert('Ta postać ma już wszystkie conditions.');
        return;
      }

      selectedConditionCharacterId = card.id;
      conditionDialogOptions.innerHTML = '';

      availableConditions.forEach((conditionName) => {
        const optionButton = document.createElement('button');
        optionButton.type = 'button';
        optionButton.className = `${getConditionTagClassName(conditionName)} condition-dialog-option`;
        optionButton.textContent = conditionName;
        optionButton.addEventListener('click', () => {
          const selectedCard = characterCards.find((entry) => entry.id === selectedConditionCharacterId);
          if (!selectedCard || selectedCard.conditions.includes(conditionName)) {
            conditionDialog.close();
            return;
          }

          selectedCard.conditions = [...selectedCard.conditions, conditionName];
          saveState();
          renderCharacterCards();
          conditionDialog.close();
        });

        conditionDialogOptions.appendChild(optionButton);
      });

      conditionDialog.showModal();
    });

    const conditionTags = document.createElement('div');
    conditionTags.className = 'condition-tags';

    card.conditions.forEach((conditionName) => {
      const conditionTagButton = document.createElement('button');
      conditionTagButton.type = 'button';
      conditionTagButton.className = getConditionTagClassName(conditionName);
      conditionTagButton.textContent = `${conditionName} ×`;
      conditionTagButton.addEventListener('click', () => {
        card.conditions = card.conditions.filter((entry) => entry !== conditionName);
        saveState();
        renderCharacterCards();
      });
      conditionTags.appendChild(conditionTagButton);
    });

    conditionsSection.append(conditionsHeader, conditionTags);

    const footerRow = document.createElement('div');
    footerRow.className = 'character-footer';

    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.className = 'delete-btn';
    removeButton.textContent = '🗑';
    removeButton.setAttribute('aria-label', 'Usuń kartę postaci');
    removeButton.addEventListener('click', () => {
      const cardIndex = characterCards.findIndex((entry) => entry.id === card.id);
      if (cardIndex !== -1) {
        characterCards.splice(cardIndex, 1);
        saveState();
        renderCharacterCards();
      }
    });

    footerRow.append(removeButton);

    cardElement.append(topRow, hpRow, statsGrid, notesRow, conditionsSection, footerRow);
    characterCardsContainer.appendChild(cardElement);
  });
}

conditionDialog.addEventListener('close', () => {
  selectedConditionCharacterId = null;
  conditionDialogOptions.innerHTML = '';
});

function renderAll() {
  renderList();
  renderCharacterCards();
  renderTimeList();
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

addCharacterButton.addEventListener('click', () => {
  characterCards.push({
    id: nextCharacterId,
    level: '',
    name: '',
    hp: '',
    maxHp: '',
    ac: '',
    passivePerception: '',
    inspiration: '',
    notes: '',
    notesHeight: '',
    conditions: [],
  });
  nextCharacterId += 1;
  saveState();
  renderCharacterCards();
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
renderAll();
