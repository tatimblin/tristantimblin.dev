---
title: "Trie type-ahead"
description: "Autocomplete type-ahead implemented as a trie tree over 10,000 common English words. Candidates are ranked by word frequency and how often they follow the previous word. Frequency is counted with a bigram table."
date: 2023-11-04
tags: ["data-structures", "svelte", "typescript"]
embed: trie-autocomplete
panel: closed
poster:
  src: ./images/trie-autocomplete.webp
  alt: "A white page under the heading Trie type-ahead: the large line I want to go to New Y, finished in light gray as York beside a green Tab button, with York, Year, You, Your and Years offered below"
notes: "It types a sentence by itself, taking each word as soon as it's suggested; tap the sentence to take over. The gray letters finish the word you're on: Tab or the green button accepts them, and PageUp/PageDown or a tap on another word picks a different match."
credits: "Part of a front-end data-structures collection; the trie is @tristimb/data-structures. Next-word counts from Tatoeba (CC BY 2.0 FR)."
draft: false
---
