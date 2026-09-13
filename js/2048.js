(() => {
  const SIZE = 4;
  const LAUNCHER_ID = "ghrc-2048-launcher";
  const MODAL_ID = "ghrc-2048-modal";

  function emptyBoard() {
    return Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
  }

  function cloneBoard(board) {
    return board.map((row) => [...row]);
  }

  function sameBoard(first, second) {
    return first.every((row, rowIndex) => (
      row.every((value, columnIndex) => value === second[rowIndex][columnIndex])
    ));
  }

  function availableCells(board) {
    const cells = [];
    board.forEach((row, rowIndex) => {
      row.forEach((value, columnIndex) => {
        if (value === 0) cells.push([rowIndex, columnIndex]);
      });
    });
    return cells;
  }

  function addRandomTile(board, random = Math.random) {
    const open = availableCells(board);
    if (!open.length) return false;
    const [row, column] = open[Math.floor(random() * open.length)];
    board[row][column] = random() < 0.9 ? 2 : 4;
    return true;
  }

  function collapseLine(line) {
    const values = line.filter(Boolean);
    const collapsed = [];
    let score = 0;

    for (let index = 0; index < values.length; index += 1) {
      if (values[index] === values[index + 1]) {
        const merged = values[index] * 2;
        collapsed.push(merged);
        score += merged;
        index += 1;
      } else {
        collapsed.push(values[index]);
      }
    }

    while (collapsed.length < SIZE) collapsed.push(0);
    return { line: collapsed, score };
  }

  function moveBoard(board, direction) {
    const next = emptyBoard();
    let gainedScore = 0;

    for (let index = 0; index < SIZE; index += 1) {
      const source = direction === "left" || direction === "right"
        ? [...board[index]]
        : board.map((row) => row[index]);

      if (direction === "right" || direction === "down") source.reverse();
      const collapsed = collapseLine(source);
      let output = collapsed.line;
      gainedScore += collapsed.score;
      if (direction === "right" || direction === "down") output = [...output].reverse();

      output.forEach((value, lineIndex) => {
        if (direction === "left" || direction === "right") {
          next[index][lineIndex] = value;
        } else {
          next[lineIndex][index] = value;
        }
      });
    }

    return {
      board: next,
      score: gainedScore,
      moved: !sameBoard(board, next),
    };
  }

  function canMove(board) {
    if (availableCells(board).length) return true;

    for (let row = 0; row < SIZE; row += 1) {
      for (let column = 0; column < SIZE; column += 1) {
        if (column + 1 < SIZE && board[row][column] === board[row][column + 1]) {
          return true;
        }
        if (row + 1 < SIZE && board[row][column] === board[row + 1][column]) {
          return true;
        }
      }
    }
    return false;
  }

  function newGame(random = Math.random) {
    const board = emptyBoard();
    addRandomTile(board, random);
    addRandomTile(board, random);
    return { board, score: 0, history: [] };
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      SIZE,
      emptyBoard,
      cloneBoard,
      sameBoard,
      availableCells,
      addRandomTile,
      collapseLine,
      moveBoard,
      canMove,
      newGame,
    };
    return;
  }

  function tileIcon() {
    const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    icon.setAttribute("viewBox", "0 0 24 24");
    icon.setAttribute("aria-hidden", "true");
    icon.classList.add("ghrc-2048-launcher-icon");

    for (const [x, y] of [[3, 3], [13, 3], [3, 13], [13, 13]]) {
      const tile = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      tile.setAttribute("x", String(x));
      tile.setAttribute("y", String(y));
      tile.setAttribute("width", "8");
      tile.setAttribute("height", "8");
      tile.setAttribute("rx", "1.5");
      icon.append(tile);
    }
    return icon;
  }

  function createLauncher() {
    const button = document.createElement("button");
    button.id = LAUNCHER_ID;
    button.type = "button";
    button.className = "ghrc-2048-launcher";
    button.setAttribute("aria-label", "Play 2048");
    button.title = "Play 2048";
    button.append(tileIcon());
    button.addEventListener("click", openGame);
    return button;
  }

  function installLauncher() {
    const footer = document.querySelector(
      "#github-repositories-for-chatgpt .ghrc-dashboard-footer",
    );
    if (!footer || footer.querySelector(`#${LAUNCHER_ID}`)) return;

    let left = footer.querySelector(".ghrc-2048-footer-left");
    if (!left) {
      left = document.createElement("div");
      left.className = "ghrc-2048-footer-left";
      const pagination = footer.querySelector(":scope > .ghrc-pagination");
      if (pagination) left.append(pagination);
      footer.prepend(left);
    }
    left.prepend(createLauncher());
  }

  function tileClass(value) {
    return value <= 2048 ? `ghrc-2048-tile-${value}` : "ghrc-2048-tile-super";
  }

  function openGame() {
    if (document.getElementById(MODAL_ID)) return;

    let game = newGame();
    const overlay = document.createElement("div");
    overlay.id = MODAL_ID;
    overlay.className = "ghrc-2048-overlay";
    overlay.setAttribute("role", "presentation");

    const dialog = document.createElement("section");
    dialog.className = "ghrc-2048-dialog";
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-labelledby", "ghrc-2048-title");

    const header = document.createElement("header");
    header.className = "ghrc-2048-header";

    const heading = document.createElement("div");
    const title = document.createElement("h2");
    title.id = "ghrc-2048-title";
    title.textContent = "2048";
    const subtitle = document.createElement("p");
    subtitle.textContent = "Arrow keys or WASD";
    heading.append(title, subtitle);

    const close = document.createElement("button");
    close.type = "button";
    close.className = "ghrc-2048-close";
    close.setAttribute("aria-label", "Close 2048");
    close.textContent = "×";
    header.append(heading, close);

    const controls = document.createElement("div");
    controls.className = "ghrc-2048-controls";

    const score = document.createElement("div");
    score.className = "ghrc-2048-score";
    const scoreLabel = document.createElement("span");
    scoreLabel.textContent = "Score";
    const scoreValue = document.createElement("strong");
    score.append(scoreLabel, scoreValue);

    const actions = document.createElement("div");
    actions.className = "ghrc-2048-actions";
    const undo = document.createElement("button");
    undo.type = "button";
    undo.textContent = "Undo";
    undo.title = "Undo as many moves as this session has";
    const restart = document.createElement("button");
    restart.type = "button";
    restart.textContent = "New";
    actions.append(undo, restart);
    controls.append(score, actions);

    const boardElement = document.createElement("div");
    boardElement.className = "ghrc-2048-board";
    boardElement.setAttribute("aria-label", "2048 board");

    const status = document.createElement("p");
    status.className = "ghrc-2048-status";
    status.setAttribute("aria-live", "polite");

    dialog.append(header, controls, boardElement, status);
    overlay.append(dialog);
    document.body.append(overlay);

    const render = () => {
      boardElement.replaceChildren();
      game.board.flat().forEach((value) => {
        const tile = document.createElement("div");
        tile.className = value
          ? `ghrc-2048-tile ${tileClass(value)}`
          : "ghrc-2048-tile ghrc-2048-tile-empty";
        tile.textContent = value || "";
        tile.setAttribute("aria-label", value ? String(value) : "Empty");
        boardElement.append(tile);
      });

      scoreValue.textContent = game.score.toLocaleString();
      undo.disabled = game.history.length === 0;
      status.textContent = canMove(game.board) ? "" : "No moves left";
    };

    const move = (direction) => {
      const result = moveBoard(game.board, direction);
      if (!result.moved) {
        render();
        return;
      }

      game.history.push({
        board: cloneBoard(game.board),
        score: game.score,
      });
      game.board = result.board;
      game.score += result.score;
      addRandomTile(game.board);
      render();
    };

    const undoMove = () => {
      const previous = game.history.pop();
      if (!previous) return;
      game.board = cloneBoard(previous.board);
      game.score = previous.score;
      render();
    };

    const reset = () => {
      game = newGame();
      render();
    };

    const keyMap = {
      ArrowLeft: "left",
      ArrowRight: "right",
      ArrowUp: "up",
      ArrowDown: "down",
      a: "left",
      A: "left",
      d: "right",
      D: "right",
      w: "up",
      W: "up",
      s: "down",
      S: "down",
    };

    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        destroy();
        return;
      }

      const direction = keyMap[event.key];
      if (!direction) return;
      event.preventDefault();
      move(direction);
    };

    let touchStart = null;
    const onTouchStart = (event) => {
      const touch = event.changedTouches[0];
      touchStart = touch ? { x: touch.clientX, y: touch.clientY } : null;
    };
    const onTouchEnd = (event) => {
      if (!touchStart) return;
      const touch = event.changedTouches[0];
      if (!touch) return;
      const deltaX = touch.clientX - touchStart.x;
      const deltaY = touch.clientY - touchStart.y;
      touchStart = null;
      if (Math.max(Math.abs(deltaX), Math.abs(deltaY)) < 24) return;
      if (Math.abs(deltaX) > Math.abs(deltaY)) {
        move(deltaX > 0 ? "right" : "left");
      } else {
        move(deltaY > 0 ? "down" : "up");
      }
    };

    function destroy() {
      document.removeEventListener("keydown", onKeyDown, true);
      boardElement.removeEventListener("touchstart", onTouchStart);
      boardElement.removeEventListener("touchend", onTouchEnd);
      overlay.remove();
    }

    close.addEventListener("click", destroy);
    overlay.addEventListener("pointerdown", (event) => {
      if (event.target === overlay) destroy();
    });
    undo.addEventListener("click", undoMove);
    restart.addEventListener("click", reset);
    document.addEventListener("keydown", onKeyDown, true);
    boardElement.addEventListener("touchstart", onTouchStart, { passive: true });
    boardElement.addEventListener("touchend", onTouchEnd, { passive: true });

    render();
    close.focus();
  }

  const observer = new MutationObserver(installLauncher);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  installLauncher();
})();
