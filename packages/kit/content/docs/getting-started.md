# Getting started

This is everything you need to go from a fresh computer to a running game.

## 1. Install Node.js (one time)

Your computer needs a free program called **Node.js**. It runs your game's code on your machine. You only install it
once.

1. Go to **nodejs.org** and download the button marked **LTS** (it means "the stable one").
2. Install it like any other app: keep clicking Next or Continue.
3. Quit and reopen your editor so it notices the new program.

## 2. Open a terminal

A terminal is a place to type commands. Most editors have one built in:

- **Zed:** open the bottom panel, or use the menu to show the terminal.
- **VS Code / Cursor:** the menu has "Terminal".

Make sure the terminal is sitting in your game's folder (the one with `package.json` in it).

## 3. Install the game's parts

Type this and press Enter. It downloads the Blit-Tech engine. Wait for it to finish.

```bash
npm install
```

## 4. Run the game

```bash
npm run dev
```

It prints a web address like `http://localhost:5173`. Hold Cmd (or Ctrl on Windows) and click it, or paste it into your
browser. Your game is running. Leave the terminal open while you play.

You can also type `blit run`, which does the same thing in a friendlier way.

## 5. Change something

Open `src/game.js`. Find a number or a color and change it. Save the file. The browser updates by itself. That is the
whole loop: change a little, look, repeat.

## If something seems wrong

Run `blit doctor`. It checks your Node version, whether your work is saved with git, and which version of Blit-Tech you
have, then tells you what to do in plain language.
