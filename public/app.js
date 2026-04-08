// Element
const citySearch = document.getElementById("citySearch");
const searchBtn = document.getElementById("searchBtn");
const resetSearchBtn = document.getElementById("resetSearchBtn");

const locationStatus = document.getElementById("locationStatus");

const heritageList = document.getElementById("heritageList");
const listLanguage = document.getElementById("listLanguage");
const showMoreBtn = document.getElementById("showMoreBtn");
const showLessBtn = document.getElementById("showLessBtn");

const modalOverlay = document.getElementById("modalOverlay");
const closeModalBtn = document.getElementById("closeModal");
const modalTitle = document.getElementById("modalTitle");
const modalText = document.getElementById("modalText");
const unescoLink = document.getElementById("unescoLink");

const smsPhone = document.getElementById("smsPhone");
const smsConsent = document.getElementById("smsConsent");
const radiusSelect = document.getElementById("radiusSelect");
const subscribeBtn = document.getElementById("subscribeBtn");
const subscriptionStatus = document.getElementById("subscriptionStatus");


// State
let heritageSites = [];
let displayedSites = [];
let userLocation = null;
let currentLanguage = "en";
let selectedSite = null;
let originalModalText = "";
let currentMode = "nearby";

let searchResults = [];
let isShowingAllResults = false;

let klarnaAuthorized = false;
let klarnaClientToken = null;

let currentSubscriptionId = null;

// Hjälpfunktion: välj slumpade världsarv
function getRandomSites(count = 3) {
  const copy = [...heritageSites];

  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }

  return copy.slice(0, count);
}

// Hjälpfunktion: visa/dölj knappar
function updateResultButtons() {
  if (currentMode === "search" && searchResults.length > 3) {
    if (isShowingAllResults) {
      showMoreBtn.classList.add("hidden");
      showLessBtn.classList.remove("hidden");
    } else {
      showMoreBtn.classList.remove("hidden");
      showLessBtn.classList.add("hidden");
    }
  } else {
    showMoreBtn.classList.add("hidden");
    showLessBtn.classList.add("hidden");
  }
}

// Hjälpfunktion: återställ listan beroende på läge
function setDefaultDisplayedSites() {
  searchResults = [];
  isShowingAllResults = false;

  if (userLocation) {
    sortSitesByDistance();
    locationStatus.textContent = "Visar världsarv nära dig 📍";
  } else {
    displayedSites = getRandomSites(3);
    locationStatus.textContent = "Visar 3 världsarv att börja med.";
  }

  updateResultButtons();
}

citySearch.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    searchByCity();
  }
});

searchBtn.addEventListener("click", searchByCity);
resetSearchBtn.addEventListener("click", resetToNearby);

showMoreBtn.addEventListener("click", () => {
  displayedSites = [...searchResults];
  isShowingAllResults = true;
  locationStatus.textContent = `Visar alla ${searchResults.length} resultat för: ${citySearch.value.trim()}`;
  renderHeritageList();
  updateResultButtons();
});

showLessBtn.addEventListener("click", () => {
  displayedSites = searchResults.slice(0, 3);
  isShowingAllResults = false;
  locationStatus.textContent = `Visar ${Math.min(3, searchResults.length)} av ${searchResults.length} resultat för: ${citySearch.value.trim()}`;
  renderHeritageList();
  updateResultButtons();
});

function resetToNearby() {
  currentMode = "nearby";
  citySearch.value = "";

  setDefaultDisplayedSites();
  renderHeritageList();
}

async function loadHeritageSites() {
  try {
    locationStatus.textContent = "Hämtar världsarv från UNESCO...";

    const response = await fetch("/api/heritage");
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Failed to fetch UNESCO data");
    }

    heritageSites = data;

    // Visa bara 3 från början
    displayedSites = getRandomSites(3);
    locationStatus.textContent = "Visar 3 världsarv att börja med.";
    renderHeritageList();
    updateResultButtons();

    // Försök sedan hämta platsdata
    getUserLocation();
  } catch (error) {
    console.error("Load heritage error:", error);
    locationStatus.textContent = "Kunde inte hämta UNESCO-data.";
  }
}

function searchByCity() {
  const query = citySearch.value.trim().toLowerCase();
  if (!query) return;

  currentMode = "search";
  isShowingAllResults = false;

  searchResults = heritageSites.filter(site =>
    (site.name || "").toLowerCase().includes(query) ||
    (site.city || "").toLowerCase().includes(query) ||
    (site.country || "").toLowerCase().includes(query)
  );

  displayedSites = searchResults.slice(0, 3);

  locationStatus.textContent = `Visar ${Math.min(3, searchResults.length)} av ${searchResults.length} resultat för: ${citySearch.value.trim()}`;
  renderHeritageList();
  updateResultButtons();
}

// Render listan
function renderHeritageList() {
  heritageList.innerHTML = "";

  if (displayedSites.length === 0) {
    heritageList.innerHTML = "<p>Inga världsarv hittades.</p>";
    return;
  }

  displayedSites.forEach(site => {
    const card = document.createElement("div");
    card.className = "heritage-item";

    let distanceText = "";
    if (site.distanceKm) {
      distanceText = `${Math.round(site.distanceKm)} km bort`;
    }

    card.innerHTML = `
      <h3>${site.name}</h3>
      <p>${site.shortText}</p>
      ${distanceText ? `<p>${distanceText}</p>` : ""}
      <button data-id="${site.id}" class="more-btn">Mer info</button>
    `;

    heritageList.appendChild(card);
  });
}

function getDistanceInKm(lat1, lng1, lat2, lng2) {
  const toRad = (value) => (value * Math.PI) / 180;

  const earthRadiusKm = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return earthRadiusKm * c;
}

function sortSitesByDistance() {
  if (!userLocation) return;

  displayedSites = heritageSites
    .filter(site => site.lat != null && site.lng != null)
    .map(site => ({
      ...site,
      distanceKm: getDistanceInKm(
        userLocation.lat,
        userLocation.lng,
        site.lat,
        site.lng
      )
    }))
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, 3);
}

function getCurrentBaseSites() {
  if (currentMode === "search") {
    return isShowingAllResults ? [...searchResults] : searchResults.slice(0, 3);
  }

  return [...displayedSites].map(site => {
    const originalSite = heritageSites.find(s => String(s.id) === String(site.id));
    return {
      ...originalSite,
      distanceKm: site.distanceKm
    };
  });
}

// Översätt lista
async function translateList(language) {
  const baseSites = getCurrentBaseSites();

  if (language === "en") {
    displayedSites = baseSites;
    renderHeritageList();
    return;
  }

  try {
    const translatedSites = [];

    for (const site of baseSites) {
      const response = await fetch("/api/translate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          text: site.shortText,
          to: language
        })
      });

      const rawText = await response.text();

      let data = {};
      if (rawText) {
        data = JSON.parse(rawText);
      }

      translatedSites.push({
        ...site,
        shortText: data.translated || site.shortText
      });
    }

    displayedSites = translatedSites;
    renderHeritageList();
  } catch (error) {
    console.error("List translation error:", error);
  }
}

// Öppna modal
function openModal(site) {
  selectedSite = site;
  originalModalText = site.longText;

  modalTitle.textContent = site.name;
  modalText.textContent = site.longText;
  unescoLink.href = site.unescoUrl;

  smsPhone.value = "";
  smsConsent.checked = false;
  radiusSelect.value = "10";
  subscriptionStatus.textContent = "";
  currentSubscriptionId = null;
  klarnaClientToken = null;

  const klarnaContainer = document.getElementById("klarna_container");
  klarnaContainer.innerHTML = "";

  modalOverlay.classList.remove("hidden");

  if (currentLanguage !== "en") {
    translateModalText(currentLanguage);
  }
}

// Stäng modal
function closeModal() {
  modalOverlay.classList.add("hidden");
  selectedSite = null;
  originalModalText = "";
}

// Översätt modaltext
async function translateModalText(language) {
  if (!selectedSite) return;

  if (language === "en") {
    modalText.textContent = originalModalText;
    return;
  }

  try {
    const response = await fetch("/api/translate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        text: originalModalText,
        to: language
      })
    });

    const rawText = await response.text();

    let data = {};
    if (rawText) {
      data = JSON.parse(rawText);
    }

    if (!response.ok) {
      modalText.textContent = `Fel: ${data.error || "Okänt fel"}`;
      return;
    }

    modalText.textContent = data.translated || "Ingen översättning returnerades";
  } catch (error) {
    modalText.textContent = `Fel vid översättning: ${error.message}`;
    console.error("Frontend error:", error);
  }
}

// När språk i listan ändras
listLanguage.addEventListener("change", async () => {
  currentLanguage = listLanguage.value;
  await translateList(currentLanguage);
});

// Klick på "Mer info"
heritageList.addEventListener("click", (e) => {
  const button = e.target.closest(".more-btn");
  if (!button) return;

  const id = button.dataset.id;
  const site = displayedSites.find(s => String(s.id) === id);

  if (site) {
    openModal(site);
  }
});

// Stängknapp
closeModalBtn.addEventListener("click", closeModal);

// Klick utanför modalen
modalOverlay.addEventListener("click", (e) => {
  if (e.target === modalOverlay) {
    closeModal();
  }
});

function getUserLocation() {
  if (!navigator.geolocation) {
    locationStatus.textContent = "Geolocation stöds inte i din webbläsare.";
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (position) => {
      userLocation = {
        lat: position.coords.latitude,
        lng: position.coords.longitude
      };

      searchResults = [];
      isShowingAllResults = false;

      sortSitesByDistance();
      locationStatus.textContent = "Visar världsarv nära dig 📍";
      renderHeritageList();
      updateResultButtons();
    },
    () => {
      locationStatus.textContent = "Platsdata nekades. Visar 3 världsarv att börja med.";
      displayedSites = getRandomSites(3);
      searchResults = [];
      isShowingAllResults = false;
      renderHeritageList();
      updateResultButtons();
    }
  );
}


subscribeBtn.addEventListener("click", async () => {
  const phoneNumber = smsPhone.value.trim();
  const radiusKm = Number(radiusSelect.value);

  if (!phoneNumber) {
    subscriptionStatus.textContent = "Fyll i mobilnummer först.";
    return;
  }

  if (!smsConsent.checked) {
    subscriptionStatus.textContent = "Du måste godkänna SMS-notifieringar.";
    return;
  }

  try {
    subscriptionStatus.textContent = "Förbereder Klarna...";

    const response = await fetch("/api/subscription/prepare", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        phoneNumber,
        radiusKm
      })
    });

    const data = await response.json();
    console.log("Prepare response:", data);

    if (!response.ok) {
      subscriptionStatus.textContent =
        data?.details?.internal_message ||
        data?.error ||
        "Kunde inte starta Klarna.";
      return;
    }

    currentSubscriptionId = data.subscriptionId;
    klarnaClientToken = data.clientToken;

    if (!klarnaClientToken) {
      subscriptionStatus.textContent = "Kunde inte hämta Klarna-token.";
      return;
    }

    Klarna.Payments.init({
      client_token: klarnaClientToken
    });

    Klarna.Payments.load(
      {
        container: "#klarna_container",
        payment_method_category: "pay_later"
      },
      {},
      function (loadRes) {
        console.log("Klarna load response:", loadRes);

        if (!loadRes.show_form) {
          subscriptionStatus.textContent = "Kunde inte visa Klarna-formuläret.";
          return;
        }

        subscriptionStatus.textContent = "Öppnar Klarna...";

        Klarna.Payments.authorize(
          {
            payment_method_category: "pay_later"
          },
          {},
          async function (authRes) {
            console.log("Klarna authorize response:", authRes);

            if (authRes.approved) {
              subscriptionStatus.textContent = "Betalning godkänd. Aktiverar prenumeration...";

              const activateResponse = await fetch("/api/subscription/activate", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json"
                },
                body: JSON.stringify({
                  subscriptionId: currentSubscriptionId
                })
              });

              const activateData = await activateResponse.json();
              console.log("Activate response:", activateData);

              if (activateResponse.ok) {
                subscriptionStatus.innerHTML = `
                  <div class="subscription-success">
                    <div class="success-icon">✅</div>
                    <div>
                      <strong>Prenumeration aktiv!</strong><br>
                      Du får nu SMS när du är nära ett världsarv.
                    </div>
                  </div>
                `;

                document.querySelector(".subscription-actions").style.display = "none";
                document.getElementById("klarna_container").style.display = "none";
                smsPhone.style.display = "none";
                radiusSelect.style.display = "none";
                smsConsent.parentElement.style.display = "none";

              } else {
                subscriptionStatus.textContent =
                  "Betalningen godkändes, men aktivering misslyckades.";
              }
            } else {
              subscriptionStatus.textContent = "Betalningen godkändes inte.";
            }
          }
        );
      }
    );
  } catch (error) {
    console.error("Klarna start error:", error);
    subscriptionStatus.textContent = "Tekniskt fel vid start av Klarna.";
  }
});

// Init
loadHeritageSites();