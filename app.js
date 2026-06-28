// Safe localStorage wrapper to prevent crashes in private windows / webviews
const safeStorage = {
  getItem(key) {
    try {
      return localStorage.getItem(key);
    } catch (e) {
      console.warn('LocalStorage read blocked:', e);
      return null;
    }
  },
  setItem(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch (e) {
      console.warn('LocalStorage write blocked:', e);
    }
  },
  removeItem(key) {
    try {
      localStorage.removeItem(key);
    } catch (e) {
      console.warn('LocalStorage delete blocked:', e);
    }
  }
};

// Natures List (Standard 25 Pokémon Natures)
const NATURES = [
  'Adamant', 'Bashful', 'Bold', 'Brave', 'Calm',
  'Careful', 'Docile', 'Gentle', 'Hardy', 'Hasty',
  'Impish', 'Jolly', 'Lax', 'Lonely', 'Mild',
  'Modest', 'Naive', 'Naughty', 'Quiet', 'Quirky',
  'Rash', 'Relaxed', 'Sassy', 'Serious', 'Timid'
];

// PokéAPI Caching and Data Store
const store = {
  pokemonList: [], // Array of formatted Pokémon names
  itemsList: [],    // Array of formatted Item names
  pokemonDetails: {}, // Cache of pokemon detailed data: { name: { abilities: [], moves: [], sprite: '' } }
  activeSuggestions: null // Tracks current autocomplete suggestion element
};

// Formatting Helper (slug-name -> Display Name)
// e.g. "choice-band" -> "Choice Band", "raging-bolt" -> "Raging Bolt"
function formatSlug(slug) {
  if (!slug) return '';
  
  // Custom manual mappings for clean VGC naming
  const specialCases = {
    'wellspring-mask': 'Wellspring Mask',
    'hearthflame-mask': 'Hearthflame Mask',
    'cornerstone-mask': 'Cornerstone Mask',
    'single-strike': 'Single Strike',
    'rapid-strike': 'Rapid Strike',
    'roaring-moon': 'Roaring Moon',
    'flutter-mane': 'Flutter Mane',
    'great-tusk': 'Great Tusk',
    'scream-tail': 'Scream Tail',
    'brute-bonnet': 'Brute Bonnet',
    'slither-wing': 'Slither Wing',
    'sandy-shocks': 'Sandy Shocks',
    'iron-treads': 'Iron Treads',
    'iron-bundle': 'Iron Bundle',
    'iron-hands': 'Iron Hands',
    'iron-jugulis': 'Iron Jugulis',
    'iron-moth': 'Iron Moth',
    'iron-thorns': 'Iron Thorns',
    'iron-valiant': 'Iron Valiant',
    'iron-leaves': 'Iron Leaves',
    'iron-crown': 'Iron Crown',
    'iron-boulder': 'Iron Boulder',
    'walking-wake': 'Walking Wake',
    'gouging-fire': 'Gouging Fire',
    'raging-bolt': 'Raging Bolt',
    'ting-lu': 'Ting-Lu',
    'chien-pao': 'Chien-Pao',
    'wo-chien': 'Wo-Chien',
    'chi-yu': 'Chi-Yu',
    'ho-oh': 'Ho-Oh',
    'porygon-z': 'Porygon-Z',
    'porygon2': 'Porygon2',
    'jangmo-o': 'Jangmo-o',
    'hakamo-o': 'Hakamo-o',
    'kommo-o': 'Kommo-o',
    'u-turn': 'U-turn',
    'v-create': 'V-create',
    'trick-room': 'Trick Room',
    'will-o-wisp': 'Will-O-Wisp',
    'multi-attack': 'Multi-Attack',
    'freeze-dry': 'Freeze-Dry',
    'baby-doll-eyes': 'Baby-Doll Eyes',
    'tada-lyser': 'Tada-lyser',
    'soft-boiled': 'Soft-Boiled',
    'self-destruct': 'Self-Destruct',
    'double-edge': 'Double-Edge',
    'mud-slap': 'Mud-Slap',
    'lock-on': 'Lock-On',
    'octazooka': 'Octazooka',
    'sand-attack': 'Sand Attack'
  };

  if (specialCases[slug.toLowerCase()]) {
    return specialCases[slug.toLowerCase()];
  }

  // Remove common suffixes that clutter sheet (e.g. -gmax, -mega, -normal, -incarnate)
  let clean = slug;
  const cleanSuffixes = ['-incarnate', '-normal', '-standard', '-altered', '-land', '-average', '-shield', '-active', '-ordinary', '-50', '-solo'];
  for (const suffix of cleanSuffixes) {
    if (clean.endsWith(suffix)) {
      clean = clean.slice(0, -suffix.length);
    }
  }

  return clean
    .split('-')
    .map(word => {
      if (!word) return '';
      // Capitalize first letter of each word
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ');
}

// ----------------------------------------------------
// Initialization and PokéAPI Fetching
// ----------------------------------------------------

async function initPokeData() {
  console.log('Initializing PokeAPI datasets...');
  
  // Try loading cached Pokemon names
  const cachedPokemon = safeStorage.getItem('vgc_pokemon_list');
  const cachedItems = safeStorage.getItem('vgc_items_list');
  
  if (cachedPokemon && cachedItems) {
    try {
      store.pokemonList = JSON.parse(cachedPokemon);
      store.itemsList = JSON.parse(cachedItems);
      console.log('Datasets loaded successfully from local storage.');
    } catch (e) {
      console.warn('Failed to parse cached pokemon lists, fetching again.');
      safeStorage.removeItem('vgc_pokemon_list');
      safeStorage.removeItem('vgc_items_list');
    }
  } else {
    try {
      // Fetch Pokemon list (limit to Generation 9 including DLC)
      const pkResponse = await fetch('https://pokeapi.co/api/v2/pokemon?limit=1025');
      const pkData = await pkResponse.json();
      store.pokemonList = pkData.results.map(p => ({
        name: formatSlug(p.name),
        slug: p.name
      }));
      
      // Fetch Item list (fetch broad set, filter to items likely held in battles)
      const itemResponse = await fetch('https://pokeapi.co/api/v2/item?limit=2100');
      const itemData = await itemResponse.json();
      store.itemsList = itemData.results
        .filter(i => {
          const name = i.name;
          // Filter out TMs, berries are good, key items, letter items, fossils, etc.
          return !name.startsWith('tm') && !name.startsWith('tr') && !name.includes('hm') && !name.includes('badge') && !name.includes('key');
        })
        .map(i => ({
          name: formatSlug(i.name),
          slug: i.name
        }));
      
      // Cache lists for 1 week
      safeStorage.setItem('vgc_pokemon_list', JSON.stringify(store.pokemonList));
      safeStorage.setItem('vgc_items_list', JSON.stringify(store.itemsList));
      console.log('Datasets successfully fetched and cached.');
    } catch (error) {
      console.warn('Could not fetch datasets from PokéAPI. Operating in offline/manual mode.', error);
      // Fallback local list of top VGC Pokemon & Items if offline
      store.pokemonList = [
        { name: 'Koraidon', slug: 'koraidon' },
        { name: 'Miraidon', slug: 'miraidon' },
        { name: 'Flutter Mane', slug: 'flutter-mane' },
        { name: 'Urshifu', slug: 'urshifu-single-strike' },
        { name: 'Urshifu (Rapid Strike)', slug: 'urshifu-rapid-strike' },
        { name: 'Amoonguss', slug: 'amoonguss' },
        { name: 'Tornadus', slug: 'tornadus-incarnate' },
        { name: 'Incineroar', slug: 'incineroar' },
        { name: 'Rillaboom', slug: 'rillaboom' },
        { name: 'Ogerpon', slug: 'ogerpon' },
        { name: 'Chien-Pao', slug: 'chien-pao' },
        { name: 'Chi-Yu', slug: 'chi-yu' },
        { name: 'Ting-Lu', slug: 'ting-lu' },
        { name: 'Raging Bolt', slug: 'raging-bolt' },
        { name: 'Gholdengo', slug: 'gholdengo' },
        { name: 'Farigiraf', slug: 'farigiraf' },
        { name: 'Ursaluna', slug: 'ursaluna' },
        { name: 'Pelipper', slug: 'pelipper' },
        { name: 'Archaludon', slug: 'archaludon' }
      ];
      store.itemsList = [
        { name: 'Focus Sash', slug: 'focus-sash' },
        { name: 'Choice Specs', slug: 'choice-specs' },
        { name: 'Choice Scarf', slug: 'choice-scarf' },
        { name: 'Choice Band', slug: 'choice-band' },
        { name: 'Assault Vest', slug: 'assault-vest' },
        { name: 'Leftovers', slug: 'leftovers' },
        { name: 'Life Orb', slug: 'life-orb' },
        { name: 'Clear Amulet', slug: 'clear-amulet' },
        { name: 'Rocky Helmet', slug: 'rocky-helmet' },
        { name: 'Sitrus Berry', slug: 'sitrus-berry' },
        { name: 'Booster Energy', slug: 'booster-energy' },
        { name: 'Mental Herb', slug: 'mental-herb' }
      ];
    }
  }
}

// Fetch and cache details for a specific Pokemon
async function fetchPokemonDetails(slot, slug) {
  const statusIndicator = document.getElementById(`api-status-${slot}`);
  
  // If already cached
  if (store.pokemonDetails[slug]) {
    updateCardAvatar(slot, store.pokemonDetails[slug].sprite);
    return store.pokemonDetails[slug];
  }
  
  if (statusIndicator) {
    statusIndicator.className = 'pokemon-api-status loading';
  }

  try {
    const response = await fetch(`https://pokeapi.co/api/v2/pokemon/${slug}`);
    if (!response.ok) throw new Error('Pokemon not found');
    const data = await response.json();
    
    const details = {
      abilities: data.abilities.map(a => formatSlug(a.ability.name)),
      moves: data.moves.map(m => formatSlug(m.move.name)).sort(),
      sprite: data.sprites.front_default || ''
    };
    
    // Save to cache
    store.pokemonDetails[slug] = details;
    
    // Update card header status & visual avatar
    if (statusIndicator) {
      statusIndicator.className = 'pokemon-api-status loaded';
    }
    updateCardAvatar(slot, details.sprite);
    
    return details;
  } catch (error) {
    console.error(`Error fetching details for Pokemon slug "${slug}":`, error);
    if (statusIndicator) {
      statusIndicator.className = 'pokemon-api-status'; // reset
    }
    return null;
  }
}

// Show a small Pokemon sprite inside the card header
function updateCardAvatar(slot, spriteUrl) {
  const cardHeader = document.querySelector(`.pokemon-card[data-slot="${slot}"] .pokemon-card-header`);
  if (!cardHeader) return;
  
  let img = cardHeader.querySelector('.pokemon-sprite-preview');
  
  if (spriteUrl) {
    if (!img) {
      img = document.createElement('img');
      img.className = 'pokemon-sprite-preview';
      img.style.width = '36px';
      img.style.height = '36px';
      img.style.marginRight = '8px';
      img.style.order = '-1';
      cardHeader.appendChild(img);
    }
    img.src = spriteUrl;
    img.style.display = 'block';
  } else {
    if (img) img.style.display = 'none';
  }
}

// ----------------------------------------------------
// Autocomplete System
// ----------------------------------------------------

function setupAutocomplete(input, getListCallback, onSelectCallback) {
  const slot = input.dataset.slot;
  const moveNum = input.dataset.move;
  
  // Find matching suggestions element
  let sugId = `suggestions-${input.dataset.field}-${slot}`;
  if (moveNum) {
    sugId = `suggestions-move-${slot}-${moveNum}`;
  }
  
  const suggestionsBox = document.getElementById(sugId);
  if (!suggestionsBox) return;

  // Render suggestion dropdown
  function showSuggestions(val) {
    const list = getListCallback(val);
    
    if (list.length === 0) {
      suggestionsBox.style.display = 'none';
      return;
    }
    
    suggestionsBox.innerHTML = '';
    list.slice(0, 8).forEach(item => {
      const itemEl = document.createElement('div');
      itemEl.className = 'suggestion-item';
      
      const text = typeof item === 'string' ? item : item.name;
      itemEl.innerText = text;
      
      // If object with slug (like pokemon), we can show meta
      if (item.slug) {
        const meta = document.createElement('span');
        meta.className = 'suggestion-meta';
        meta.innerText = 'Species';
        itemEl.appendChild(meta);
      }
      
      itemEl.addEventListener('mousedown', (e) => {
        e.preventDefault(); // Prevents input blur before click registers
        input.value = text;
        suggestionsBox.style.display = 'none';
        if (onSelectCallback) onSelectCallback(item, text);
        
        // Trigger print sheet update
        triggerBindingUpdate(input);
      });
      
      suggestionsBox.appendChild(itemEl);
    });
    
    suggestionsBox.style.display = 'block';
    store.activeSuggestions = suggestionsBox;
  }

  // Event Listeners
  input.addEventListener('input', () => {
    showSuggestions(input.value.trim());
  });

  input.addEventListener('focus', () => {
    showSuggestions(input.value.trim());
  });

  input.addEventListener('blur', () => {
    // Timeout to let mousedown register
    setTimeout(() => {
      suggestionsBox.style.display = 'none';
    }, 200);
  });
}

// ----------------------------------------------------
// Real-time Form Binding
// ----------------------------------------------------

function triggerBindingUpdate(input) {
  const val = input.value.trim();
  
  // Trainer Info Binding
  if (input.id === 'trainer-player-name') {
    document.getElementById('preview-player-name').innerText = val;
  } else if (input.id === 'trainer-game-name') {
    document.getElementById('preview-game-name').innerText = val;
  } else if (input.id === 'trainer-team-name') {
    document.getElementById('preview-team-name').innerText = val;
  } else if (input.id === 'trainer-profile-name') {
    document.getElementById('preview-profile-name').innerText = val;
  } else if (input.id === 'trainer-player-id') {
    document.getElementById('preview-player-id').innerText = val;
  }
  
  // Pokemon details binding
  const slot = input.dataset.slot;
  const field = input.dataset.field;
  const moveNum = input.dataset.move;
  
  if (slot) {
    if (field) {
      const previewEl = document.getElementById(`preview-${field}-${slot}`);
      if (previewEl) previewEl.innerText = val;
      
      // When Pokémon species changes, check if it's a valid one to fetch details
      if (field === 'name') {
        let slug = null;
        if (val) {
          if (store.pokemonList && store.pokemonList.length > 0) {
            const found = store.pokemonList.find(p => p.name.toLowerCase() === val.toLowerCase());
            if (found) slug = found.slug;
          } else {
            // Fallback slug generation if main list is still loading
            slug = val.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-');
          }
        }
        
        if (slug) {
          fetchPokemonDetails(slot, slug);
        } else {
          // If cleared, remove sprite
          updateCardAvatar(slot, '');
          const status = document.getElementById(`api-status-${slot}`);
          if (status) status.className = 'pokemon-api-status';
        }
      }
    } else if (moveNum) {
      const previewEl = document.getElementById(`preview-move-${slot}-${moveNum}`);
      if (previewEl) previewEl.innerText = val;
    }
  }
  
  // Auto-save form
  saveFormState();
}

// Set up all static inputs to bind instantly
function bindAllInputs() {
  const allInputs = document.querySelectorAll('input[type="text"]');
  allInputs.forEach(input => {
    input.addEventListener('input', () => triggerBindingUpdate(input));
    input.addEventListener('change', () => triggerBindingUpdate(input));
  });
}

// ----------------------------------------------------
// Local Caching of Form State
// ----------------------------------------------------

function saveFormState() {
  const formState = {
    trainer: {
      playerName: document.getElementById('trainer-player-name').value,
      gameName: document.getElementById('trainer-game-name').value,
      teamName: document.getElementById('trainer-team-name').value,
      profileName: document.getElementById('trainer-profile-name').value,
      playerId: document.getElementById('trainer-player-id').value
    },
    slots: []
  };
  
  for (let i = 1; i <= 6; i++) {
    const card = document.querySelector(`.pokemon-card[data-slot="${i}"]`);
    const slotState = {
      name: card.querySelector('.pk-name').value,
      nature: card.querySelector('.pk-nature').value,
      ability: card.querySelector('.pk-ability').value,
      item: card.querySelector('.pk-item').value,
      moves: [
        card.querySelector('.pk-move[data-move="1"]').value,
        card.querySelector('.pk-move[data-move="2"]').value,
        card.querySelector('.pk-move[data-move="3"]').value,
        card.querySelector('.pk-move[data-move="4"]').value
      ]
    };
    formState.slots.push(slotState);
  }
  
  safeStorage.setItem('vgc_form_state', JSON.stringify(formState));
}

function loadFormState() {
  const rawState = safeStorage.getItem('vgc_form_state');
  if (!rawState) return false;
  
  try {
    const state = JSON.parse(rawState);
    
    // Restore Trainer Info
    document.getElementById('trainer-player-name').value = state.trainer.playerName || '';
    document.getElementById('trainer-game-name').value = state.trainer.gameName || '';
    document.getElementById('trainer-team-name').value = state.trainer.teamName || '';
    document.getElementById('trainer-profile-name').value = state.trainer.profileName || '';
    document.getElementById('trainer-player-id').value = state.trainer.playerId || '';
    
    // Restore Pokémon Cards
    state.slots.forEach((slot, index) => {
      const slotNum = index + 1;
      const card = document.querySelector(`.pokemon-card[data-slot="${slotNum}"]`);
      
      card.querySelector('.pk-name').value = slot.name || '';
      card.querySelector('.pk-nature').value = slot.nature || '';
      card.querySelector('.pk-ability').value = slot.ability || '';
      card.querySelector('.pk-item').value = slot.item || '';
      
      card.querySelector('.pk-move[data-move="1"]').value = slot.moves[0] || '';
      card.querySelector('.pk-move[data-move="2"]').value = slot.moves[1] || '';
      card.querySelector('.pk-move[data-move="3"]').value = slot.moves[2] || '';
      card.querySelector('.pk-move[data-move="4"]').value = slot.moves[3] || '';
    });
    
    // Trigger preview rendering for all inputs
    document.querySelectorAll('input[type="text"]').forEach(input => triggerBindingUpdate(input));
    return true;
  } catch (err) {
    console.error('Failed to parse form state:', err);
    return false;
  }
}

// ----------------------------------------------------
// Example / Autofill Team Setup
// ----------------------------------------------------

const EXAMPLE_TEAM = {
  trainer: {
    playerName: 'Matias González',
    gameName: 'Matias',
    teamName: 'Reg G Hyper Offense',
    profileName: 'MatiSwitch',
    playerId: '9876543'
  },
  slots: [
    {
      name: 'Koraidon',
      nature: 'Jolly',
      ability: 'Orichalcum Pulse',
      item: 'Clear Amulet',
      moves: ['Collision Course', 'Flare Blitz', 'U-turn', 'Protect']
    },
    {
      name: 'Flutter Mane',
      nature: 'Timid',
      ability: 'Protosynthesis',
      item: 'Choice Specs',
      moves: ['Moonblast', 'Dazzling Gleam', 'Shadow Ball', 'Trick']
    },
    {
      name: 'Chi-Yu',
      nature: 'Modest',
      ability: 'Beads of Ruin',
      item: 'Focus Sash',
      moves: ['Heat Wave', 'Dark Pulse', 'Overheat', 'Protect']
    },
    {
      name: 'Raging Bolt',
      nature: 'Modest',
      ability: 'Protosynthesis',
      item: 'Assault Vest',
      moves: ['Thunderclap', 'Draco Meteor', 'Thunderbolt', 'Snarl']
    },
    {
      name: 'Amoonguss',
      nature: 'Relaxed',
      ability: 'Regenerator',
      item: 'Rocky Helmet',
      moves: ['Spore', 'Rage Powder', 'Pollen Puff', 'Protect']
    },
    {
      name: 'Tornadus',
      nature: 'Timid',
      ability: 'Prankster',
      item: 'Covert Cloak',
      moves: ['Tailwind', 'Bleakwind Storm', 'Sunny Day', 'Taunt']
    }
  ]
};

function fillExampleTeam() {
  // Fill trainer info
  document.getElementById('trainer-player-name').value = EXAMPLE_TEAM.trainer.playerName;
  document.getElementById('trainer-game-name').value = EXAMPLE_TEAM.trainer.gameName;
  document.getElementById('trainer-team-name').value = EXAMPLE_TEAM.trainer.teamName;
  document.getElementById('trainer-profile-name').value = EXAMPLE_TEAM.trainer.profileName;
  document.getElementById('trainer-player-id').value = EXAMPLE_TEAM.trainer.playerId;
  
  // Fill Pokemon
  EXAMPLE_TEAM.slots.forEach((slot, index) => {
    const slotNum = index + 1;
    const card = document.querySelector(`.pokemon-card[data-slot="${slotNum}"]`);
    
    card.querySelector('.pk-name').value = slot.name;
    card.querySelector('.pk-nature').value = slot.nature;
    card.querySelector('.pk-ability').value = slot.ability;
    card.querySelector('.pk-item').value = slot.item;
    
    card.querySelector('.pk-move[data-move="1"]').value = slot.moves[0];
    card.querySelector('.pk-move[data-move="2"]').value = slot.moves[1];
    card.querySelector('.pk-move[data-move="3"]').value = slot.moves[2];
    card.querySelector('.pk-move[data-move="4"]').value = slot.moves[3];
  });
  
  // Update UI and Preview
  document.querySelectorAll('input[type="text"]').forEach(input => triggerBindingUpdate(input));
  saveFormState();
}

function clearForm() {
  if (confirm('¿Estás seguro de que deseas limpiar todos los datos del formulario?')) {
    document.querySelectorAll('input[type="text"]').forEach(input => {
      input.value = '';
      triggerBindingUpdate(input);
    });
    // Remove avatars
    for (let i = 1; i <= 6; i++) {
      updateCardAvatar(i, '');
      const status = document.getElementById(`api-status-${i}`);
      if (status) status.className = 'pokemon-api-status';
    }
    safeStorage.removeItem('vgc_form_state');
  }
}

// ----------------------------------------------------
// PDF Generation & Print
// ----------------------------------------------------

function downloadPDF() {
  const element = document.getElementById('print-preview');
  
  // Ensure the page fits exactly into an A4 PDF sheet using html2pdf configuration
  const opt = {
    margin: 0,
    filename: 'lista_de_equipo_vgc.pdf',
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { 
      scale: 2, 
      useCORS: true,
      scrollX: 0,
      scrollY: 0
    },
    jsPDF: { 
      unit: 'mm', 
      format: 'a4', 
      orientation: 'portrait' 
    }
  };

  // Temporarily scale print element to ensure perfect conversion
  element.style.boxShadow = 'none';
  element.style.border = 'none';

  html2pdf().from(element).set(opt).save().then(() => {
    // Restore styling for screen display
    element.style.boxShadow = '';
    element.style.border = '';
  });
}

function printSheet() {
  window.print();
}

// ----------------------------------------------------
// Setup Application & Autocomplete Hooks
// ----------------------------------------------------

function setupAllAutocompletes() {
  for (let i = 1; i <= 6; i++) {
    const card = document.querySelector(`.pokemon-card[data-slot="${i}"]`);
    
    const nameInput = card.querySelector('.pk-name');
    const natureInput = card.querySelector('.pk-nature');
    const abilityInput = card.querySelector('.pk-ability');
    const itemInput = card.querySelector('.pk-item');
    const moveInputs = card.querySelectorAll('.pk-move');

    // 1. Pokémon Name Autocomplete
    setupAutocomplete(
      nameInput,
      (val) => {
        if (!val) return [];
        return store.pokemonList.filter(p => p.name.toLowerCase().includes(val.toLowerCase()));
      },
      async (item) => {
        // Fetch details when selected from dropdown
        const details = await fetchPokemonDetails(i, item.slug);
        if (details) {
          // If ability field is empty, recommend the first ability
          if (!abilityInput.value.trim() && details.abilities.length > 0) {
            abilityInput.value = details.abilities[0];
            triggerBindingUpdate(abilityInput);
          }
        }
      }
    );

    // 2. Nature Autocomplete
    setupAutocomplete(
      natureInput,
      (val) => {
        // Return full list on focus, or filter if typing
        if (!val) return NATURES;
        return NATURES.filter(n => n.toLowerCase().startsWith(val.toLowerCase()));
      }
    );

    // 3. Ability Autocomplete (queries cached abilities of currently selected Pokémon)
    setupAutocomplete(
      abilityInput,
      (val) => {
        const pkName = nameInput.value.trim();
        const found = store.pokemonList.find(p => p.name.toLowerCase() === pkName.toLowerCase());
        
        let abilitiesSource = [];
        if (found && store.pokemonDetails[found.slug]) {
          abilitiesSource = store.pokemonDetails[found.slug].abilities;
        }
        
        if (!val) return abilitiesSource;
        return abilitiesSource.filter(a => a.toLowerCase().includes(val.toLowerCase()));
      }
    );

    // 4. Held Item Autocomplete
    setupAutocomplete(
      itemInput,
      (val) => {
        if (!val) return [];
        return store.itemsList.filter(item => item.name.toLowerCase().includes(val.toLowerCase()));
      }
    );

    // 5. Moves Autocomplete (queries cached moves of currently selected Pokémon)
    moveInputs.forEach(moveInput => {
      setupAutocomplete(
        moveInput,
        (val) => {
          const pkName = nameInput.value.trim();
          const found = store.pokemonList.find(p => p.name.toLowerCase() === pkName.toLowerCase());
          
          let movesSource = [];
          if (found && store.pokemonDetails[found.slug]) {
            movesSource = store.pokemonDetails[found.slug].moves;
          }
          
          if (!val) return movesSource;
          return movesSource.filter(m => m.toLowerCase().includes(val.toLowerCase()));
        }
      );
    });
  }
}

// ----------------------------------------------------
// Mobile Responsive Enhancements
// ----------------------------------------------------

function adjustPreviewScale() {
  const previewWrapper = document.querySelector('.preview-wrapper');
  const sheet = document.getElementById('print-preview');
  if (!previewWrapper || !sheet) return;
  
  // Reset style tags to measure natural dimensions
  sheet.style.transform = '';
  sheet.style.transformOrigin = '';
  sheet.style.position = '';
  sheet.style.left = '';
  previewWrapper.style.height = '';
  
  const wrapperWidth = previewWrapper.clientWidth;
  
  // If the tab is transitioning, clientWidth might temporarily be 0.
  // We schedule a retry to re-evaluate scale once layout paint is complete.
  if (wrapperWidth === 0) {
    setTimeout(adjustPreviewScale, 50);
    return;
  }
  
  const sheetWidth = 794; // Standard A4 pixel width at 96 DPI
  
  if (wrapperWidth < sheetWidth + 32) {
    const scale = (wrapperWidth - 32) / sheetWidth;
    const leftOffset = (wrapperWidth - (sheetWidth * scale)) / 2;
    
    sheet.style.transform = `scale(${scale})`;
    sheet.style.transformOrigin = 'top left';
    sheet.style.position = 'relative';
    sheet.style.left = `${leftOffset}px`;
    
    // Scale container height to prevent extra whitespace at bottom
    const sheetHeight = 1123; // Standard A4 pixel height
    previewWrapper.style.height = `${sheetHeight * scale + 32}px`;
  }
}

function setupMobileTabs() {
  const tabButtons = document.querySelectorAll('.tab-btn');
  const mainContent = document.querySelector('.main-content');
  
  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      tabButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      const tab = btn.dataset.tab;
      if (tab === 'preview') {
        mainContent.classList.add('show-preview');
        setTimeout(adjustPreviewScale, 80);
      } else {
        mainContent.classList.remove('show-preview');
      }
    });
  });
  
  window.addEventListener('resize', adjustPreviewScale);
}

// ----------------------------------------------------
// Main Execution Entrypoint
// ----------------------------------------------------

async function main() {
  bindAllInputs();
  
  // Set up action triggers
  document.getElementById('fill-example-btn').addEventListener('click', fillExampleTeam);
  document.getElementById('clear-form-btn').addEventListener('click', clearForm);
  document.getElementById('download-pdf-btn').addEventListener('click', downloadPDF);
  document.getElementById('print-sheet-btn').addEventListener('click', printSheet);

  // Load mobile responsive structures
  setupMobileTabs();

  // Load PokeAPI datasets in the background without blocking the UI
  initPokeData();
  
  // Hook up autocompletes
  setupAllAutocompletes();
  
  // Recover form state from previous session
  loadFormState();
  
  // Adjust scaling after data is loaded
  adjustPreviewScale();
}

// Fire!
document.addEventListener('DOMContentLoaded', main);

