export type RuleGroupId = 'masculine' | 'feminine' | 'neuter' | 'tricky';

export interface ArticleRule {
  id: string;
  group: RuleGroupId;
  /** Section number, e.g. "1.4" */
  number: string;
  title: string;
  /** Optional sub-lists (e.g. persons / jobs / animals) */
  sections: { label?: string; examples: string[] }[];
  /** Words that break the rule (written with their real article) */
  exceptions?: string[];
  note?: string;
}

export const RULE_GROUPS: { id: RuleGroupId; label: string; article: string; blurb: string }[] = [
  { id: 'masculine', label: 'Maskulina', article: 'der', blurb: 'Words that are usually der' },
  { id: 'feminine', label: 'Feminina', article: 'die', blurb: 'Words that are usually die' },
  { id: 'neuter', label: 'Neutra', article: 'das', blurb: 'Words that are usually das' },
  { id: 'tricky', label: 'Either or', article: 'der/die/das', blurb: 'Rules that decide between two genders' },
];

// Examples are written with their article: "der Mann".
export const ARTICLE_RULES: ArticleRule[] = [
  // ---- Maskulina ----
  {
    id: 'm-natural', group: 'masculine', number: '1.1', title: 'Natural gender (male beings)',
    sections: [
      { label: 'Male persons', examples: ['der Mann', 'der Junge', 'der Herr', 'der Vater', 'der Bruder', 'der Sohn', 'der Onkel', 'der Freund', 'der Nachbar', 'der Mitarbeiter'] },
      { label: 'Male jobs', examples: ['der Techniker', 'der Bäcker', 'der Kaufmann', 'der Arzt', 'der Rechtsanwalt', 'der Politiker', 'der Lehrer', 'der Informatiker', 'der Krankenpfleger'] },
      { label: 'Male animals', examples: ['der Stier', 'der Kater', 'der Hahn', 'der Tiger', 'der Löwe', 'der Elefant', 'der Hengst', 'der Bock', 'der Eber', 'der Widder', 'der Hammel', 'der Ochse'] },
    ],
    exceptions: ['das Kind', 'das Mädchen'],
    note: 'Male and female persons, relatives and jobs keep their natural gender. Kind and Mädchen are always das.',
  },
  {
    id: 'm-nature-time', group: 'masculine', number: '1.2', title: 'Weather, directions and time',
    sections: [
      { label: 'Precipitation', examples: ['der Regen', 'der Schnee', 'der Hagel', 'der Tau', 'der Nebel'] },
      { label: 'Winds', examples: ['der Wind', 'der Sturm', 'der Orkan', 'der Mistral', 'der Hurrikan', 'der Schirokko', 'der Passat'] },
      { label: 'Compass directions', examples: ['der Norden', 'der Osten', 'der Süden', 'der Westen', 'der Nordosten', 'der Südwesten'] },
      { label: 'Seasons', examples: ['der Frühling', 'der Sommer', 'der Herbst', 'der Winter'] },
      { label: 'Months', examples: ['der Januar', 'der Februar', 'der März', 'der April', 'der Mai', 'der Juni', 'der Juli', 'der August', 'der September', 'der Oktober', 'der November', 'der Dezember'] },
      { label: 'Days of the week', examples: ['der Montag', 'der Dienstag', 'der Mittwoch', 'der Donnerstag', 'der Freitag', 'der Samstag', 'der Sonnabend', 'der Sonntag'] },
      { label: 'Times of day', examples: ['der Morgen', 'der Vormittag', 'der Mittag', 'der Nachmittag', 'der Abend'] },
    ],
    exceptions: ['die Nacht', 'die Brise'],
    note: 'im Frühling, im März, am Montag, am Abend – but: in der Nacht, in der Brise.',
  },
  {
    id: 'm-names', group: 'masculine', number: '1.3', title: 'Mountains, minerals and cars',
    sections: [
      { label: 'Mountains', examples: ['der Watzmann', 'der Mont Blanc', 'der Großglockner', 'der Brenner', 'der Kaiserstuhl', 'der Popocatepetl'] },
      { label: 'Minerals and gems', examples: ['der Diamant', 'der Brillant', 'der Rubin', 'der Smaragd', 'der Saphir', 'der Topas', 'der Amethyst', 'der Aquamarin', 'der Türkis', 'der Opal', 'der Malachit', 'der Glimmer'] },
      { label: 'Cars', examples: ['der Opel', 'der Fiat', 'der VW', 'der Mercedes', 'der BMW', 'der Ford', 'der Porsche', 'der Volvo', 'der Rolls-Royce'] },
    ],
    exceptions: ['die BMW', 'die Honda'],
    note: 'Names of motorcycles are feminine: die BMW, die Honda.',
  },
  {
    id: 'm-short', group: 'masculine', number: '1.4', title: 'Most one-syllable nouns without an ending',
    sections: [
      { label: 'Body and feelings', examples: ['der Kopf', 'der Hals', 'der Arm', 'der Fuß', 'der Mund', 'der Bauch', 'der Schmerz', 'der Mut', 'der Trost', 'der Hass', 'der Spaß', 'der Stolz', 'der Zorn', 'der Traum'] },
      { label: 'Things and nature', examples: ['der Bau', 'der Tag', 'der Stoff', 'der Geist', 'der Gast', 'der Grund', 'der Stich', 'der Stoß', 'der Flug', 'der Sprung', 'der Wurf', 'der Turm', 'der Tisch', 'der Stuhl', 'der Schrank', 'der Raum', 'der Sitz', 'der Stand', 'der Blitz', 'der Kohl', 'der Staat', 'der Hut', 'der Witz', 'der Zahn'] },
      { label: 'Nature', examples: ['der Baum', 'der Stamm', 'der Zweig', 'der Ast', 'der Stein', 'der Sand', 'der Strand', 'der Mond'] },
    ],
    note: 'There are many exceptions (das Haus, das Buch, die Hand, die Zeit …) – treat this as a tendency only.',
  },
  {
    id: 'm-foreign', group: 'masculine', number: '1.5', title: 'Foreign words (mostly people) with these endings',
    sections: [
      { label: '-us', examples: ['der Bonus', 'der Kursus', 'der Autobus', 'der Kapitalismus', 'der Kaktus', 'der Zirkus'] },
      { label: '-ant', examples: ['der Praktikant', 'der Demonstrant', 'der Emigrant', 'der Kommandant'] },
      { label: '-ent', examples: ['der Student', 'der Absolvent', 'der Präsident', 'der Dirigent', 'der Konkurrent'] },
      { label: '-är', examples: ['der Pensionär', 'der Veterinär', 'der Sekretär'] },
      { label: '-et', examples: ['der Prophet', 'der Asket', 'der Athlet'] },
      { label: '-eur', examples: ['der Friseur', 'der Masseur', 'der Monteur', 'der Kontrolleur'] },
      { label: '-ist', examples: ['der Pianist', 'der Statist', 'der Polizist', 'der Kapitalist'] },
      { label: '-at', examples: ['der Kandidat', 'der Demokrat'] },
      { label: '-loge', examples: ['der Philologe', 'der Graphologe', 'der Astrologe'] },
      { label: '-or', examples: ['der Doktor', 'der Humor', 'der Professor', 'der Direktor', 'der Motor', 'der Terror'] },
    ],
    exceptions: ['das Militär', 'das Labor'],
    note: 'Female forms of person words: die Friseurin, die Polizistin, die Philologin, die Professorin. Careful: -at is also found in neuter words (das Resultat) – see the Neutra rules.',
  },
  {
    id: 'm-ling', group: 'masculine', number: '1.6', title: 'All nouns ending in -ling',
    sections: [{ examples: ['der Säugling', 'der Schmetterling', 'der Feigling', 'der Sperling', 'der Fremdling', 'der Neuling', 'der Flüchtling', 'der Häftling', 'der Findling'] }],
  },

  // ---- Feminina ----
  {
    id: 'f-natural', group: 'feminine', number: '2.1', title: 'Natural gender (female beings)',
    sections: [
      { label: 'Female persons', examples: ['die Frau', 'die Mutter', 'die Schwester', 'die Tante', 'die Tochter', 'die Dame', 'die Hausfrau', 'die Nachbarin', 'die Freundin', 'die Mitarbeiterin'] },
      { label: 'Female jobs', examples: ['die Technikerin', 'die Verkäuferin', 'die Ärztin', 'die Lehrerin', 'die Rechtsanwältin', 'die Politikerin', 'die Studentin', 'die Dolmetscherin', 'die Krankenschwester'] },
      { label: 'Female animals', examples: ['die Kuh', 'die Katze', 'die Henne', 'die Glucke', 'die Ente', 'die Löwin', 'die Stute', 'die Hündin', 'die Ziege', 'die Sau'] },
    ],
    exceptions: ['das Mädchen', 'das Fräulein'],
  },
  {
    id: 'f-suffix', group: 'feminine', number: '2.2', title: 'Endings -heit, -keit, -ung, -schaft',
    sections: [
      { label: '-heit', examples: ['die Schönheit', 'die Gesundheit', 'die Krankheit', 'die Freiheit', 'die Kindheit', 'die Klarheit', 'die Dummheit'] },
      { label: '-keit', examples: ['die Ewigkeit', 'die Fähigkeit', 'die Sauberkeit', 'die Pünktlichkeit', 'die Einsamkeit', 'die Ehrlichkeit'] },
      { label: '-ung', examples: ['die Hoffnung', 'die Erwartung', 'die Bedeutung', 'die Erklärung', 'die Untersuchung', 'die Warnung', 'die Übung', 'die Wiederholung'] },
      { label: '-schaft', examples: ['die Freundschaft', 'die Feindschaft', 'die Landschaft', 'die Wirtschaft', 'die Eigenschaft', 'die Mannschaft', 'die Wissenschaft', 'die Gesellschaft'] },
    ],
    note: 'No exceptions: all of these are feminine.',
  },
  {
    id: 'f-suffix2', group: 'feminine', number: '2.3', title: 'Endings -ät, -ion, -ik, -ur, -thek, -nz',
    sections: [
      { label: '-ät', examples: ['die Nationalität', 'die Realität', 'die Aktivität', 'die Universität', 'die Qualität'] },
      { label: '-ion', examples: ['die Funktion', 'die Diskussion', 'die Nation', 'die Station', 'die Information', 'die Konzentration', 'die Religion'] },
      { label: '-ik', examples: ['die Hektik', 'die Technik', 'die Informatik', 'die Statistik', 'die Musik', 'die Physik', 'die Mathematik', 'die Politik', 'die Kritik'] },
      { label: '-ur', examples: ['die Natur', 'die Kultur', 'die Reparatur', 'die Korrektur', 'die Architektur', 'die Frisur', 'die Temperatur', 'die Struktur'] },
      { label: '-thek', examples: ['die Bibliothek', 'die Diskothek', 'die Kartothek'] },
      { label: '-nz', examples: ['die Provinz', 'die Toleranz', 'die Arroganz', 'die Ignoranz'] },
    ],
    note: 'No exceptions: all of these are feminine.',
  },
  {
    id: 'f-ie', group: 'feminine', number: '2.4', title: 'All nouns ending in -ie',
    sections: [{ examples: ['die Biologie', 'die Akademie', 'die Linie', 'die Arterie', 'die Batterie', 'die Studie', 'die Arie', 'die Aktie', 'die Familie', 'die Serie', 'die Philosophie', 'die Theologie', 'die Prärie', 'die Karosserie', 'die Melodie', 'die Sinfonie'] }],
  },
  {
    id: 'f-ei', group: 'feminine', number: '2.5', title: 'All nouns ending in -ei',
    sections: [{ examples: ['die Bäckerei', 'die Konditorei', 'die Molkerei', 'die Gärtnerei', 'die Abtei', 'die Schmeichelei', 'die Nörgelei'] }],
    note: 'Careful: das Ei is not a suffix case – it is just a one-syllable word.',
  },
  {
    id: 'f-e', group: 'feminine', number: '2.6', title: 'Most two-syllable nouns ending in -e',
    sections: [{ examples: ['die Rose', 'die Reise', 'die Ware', 'die Treppe', 'die Stufe', 'die Kette', 'die Seite', 'die Silbe'] }],
    exceptions: ['der Löwe', 'der Junge', 'der Name', 'der Käse'],
    note: 'Male beings (der Löwe, der Junge) are masculine.',
  },
  {
    id: 'f-plants', group: 'feminine', number: '2.7', title: 'Trees and flowers (mostly)',
    sections: [
      { label: 'Trees', examples: ['die Akazie', 'die Birke', 'die Buche', 'die Eibe', 'die Eiche', 'die Esche', 'die Fichte', 'die Kiefer', 'die Linde', 'die Lärche', 'die Palme', 'die Pappel', 'die Pinie', 'die Platane', 'die Tanne', 'die Ulme', 'die Weide', 'die Zypresse'] },
      { label: 'Flowers', examples: ['die Akelei', 'die Aster', 'die Begonie', 'die Dahlie', 'die Fuchsie', 'die Geranie', 'die Gladiole', 'die Lilie', 'die Margerite', 'die Narzisse', 'die Nelke', 'die Petunie', 'die Primel', 'die Rose', 'die Tulpe'] },
    ],
    exceptions: ['der Ahorn', 'der Enzian', 'der Lavendel', 'der Mohn', 'das Vergissmeinnicht', 'das Veilchen', 'das Maiglöckchen', 'das Schneeglöckchen'],
  },
  {
    id: 'f-numbers', group: 'feminine', number: '2.8', title: 'Numbers used as nouns',
    sections: [{ examples: ['die Eins', 'die Zwei', 'die Drei', 'die Vier', 'die Zehn', 'die Zwölf', 'die Hundert'] }],
    note: 'Also for school grades: eine Eins in Mathematik, eine Fünf in Deutsch. Letters, in contrast, are neuter: das A, das B.',
  },
  {
    id: 'f-ships', group: 'feminine', number: '2.9', title: 'Names of ships',
    sections: [{ examples: ['die Europa', 'die Bremen', 'die Finnjet', 'die Titanic', 'die Prinz Hamlet', 'die Peter Pan'] }],
  },

  // ---- Neutra ----
  {
    id: 'n-diminutive', group: 'neuter', number: '3.1', title: 'All diminutives (-chen, -lein) – without exception',
    sections: [
      { label: '-chen', examples: ['das Häuschen', 'das Blümchen', 'das Tischchen', 'das Hähnchen', 'das Kätzchen', 'das Mädchen'] },
      { label: '-lein', examples: ['das Blümlein', 'das Kindlein', 'das Dörflein', 'das Fräulein', 'das Männlein'] },
    ],
    note: 'Learn more in the Diminutives section.',
  },
  {
    id: 'n-young', group: 'neuter', number: '3.2', title: 'Young animals and children',
    sections: [{ examples: ['das Kind', 'das Baby', 'das Junge', 'das Fohlen', 'das Kalb', 'das Lamm', 'das Ferkel', 'das Küken'] }],
    note: 'das Junge = the young animal, but der Junge = the boy.',
  },
  {
    id: 'n-animals', group: 'neuter', number: '3.3', title: 'Generic animal names',
    sections: [{ label: 'Gattungsnamen', examples: ['das Tier', 'das Vieh', 'das Huhn', 'das Pferd', 'das Rind', 'das Schwein', 'das Schaf'] }],
    note: 'The specific male/female animals follow natural gender: der Hahn / die Henne, der Hengst / die Stute, der Bock / die Ziege.',
  },
  {
    id: 'n-verbs', group: 'neuter', number: '3.4', title: 'Verbs used as nouns – without exception',
    sections: [{ examples: ['das Lesen', 'das Spielen', 'das Arbeiten', 'das Lernen', 'das Hören', 'das Sehen', 'das Gehen', 'das Lachen', 'das Weinen', 'das Sprechen', 'das Kommen', 'das Lächeln'] }],
  },
  {
    id: 'n-letters', group: 'neuter', number: '3.5', title: 'Names of letters',
    sections: [{ examples: ['das A', 'das B', 'das C', 'das F', 'das K'] }],
  },
  {
    id: 'n-um', group: 'neuter', number: '3.6', title: 'Foreign words ending in -um – without exception',
    sections: [{ label: '-um', examples: ['das Album', 'das Aquarium', 'das Datum', 'das Individuum', 'das Kriterium', 'das Museum', 'das Praktikum', 'das Publikum', 'das Territorium', 'das Stipendium', 'das Studium', 'das Visum', 'das Zentrum'] }, { label: '-ol', examples: ['das Symbol'] }],
  },
  {
    id: 'n-tum', group: 'neuter', number: '3.7', title: 'Nouns ending in -tum',
    sections: [{ examples: ['das Wachstum', 'das Altertum', 'das Brauchtum', 'das Siechtum', 'das Volkstum', 'das Schrifttum'] }],
    exceptions: ['der Reichtum'],
  },
  {
    id: 'n-adjectives', group: 'neuter', number: '3.8', title: 'Adjectives and participles used as nouns',
    sections: [
      { label: 'Adjectives', examples: ['das Schöne', 'das Hässliche', 'das Gute', 'das Böse', 'das Beste', 'das Neue', 'das Alte', 'das Süße', 'das Saure', 'das Harte', 'das Weiche', 'das Teure', 'das Große'] },
      { label: 'Participles', examples: ['das Gelernte', 'das Erhoffte', 'das Gehörte', 'das Gekaufte', 'das Bezahlte', 'das Gesagte', 'das Gelesene', 'das Geschriebene', 'das Verlorene', 'das Kommende', 'das Lebende'] },
    ],
    note: 'Exception: when they mean people they keep natural gender – see "Either or".',
  },
  {
    id: 'n-colours', group: 'neuter', number: '3.9', title: 'Names of colours',
    sections: [{ examples: ['das Rot', 'das Rote', 'das Blau', 'das Blaue', 'das Grün', 'das Grüne', 'das Weiß', 'das Schwarz', 'das Grau', 'das Gelb', 'das Hellblau', 'das Giftgrün'] }],
  },
  {
    id: 'n-metals', group: 'neuter', number: '3.10', title: 'Names of metals',
    sections: [{ examples: ['das Gold', 'das Silber', 'das Platin', 'das Kupfer', 'das Zinn', 'das Messing', 'das Blei', 'das Eisen', 'das Aluminium', 'das Nickel', 'das Kobalt'] }],
    exceptions: ['die Bronze', 'der Stahl'],
  },
  {
    id: 'n-fractions', group: 'neuter', number: '3.11', title: 'Fractions',
    sections: [{ examples: ['das Viertel', 'das Drittel', 'das Fünftel', 'das Zehntel', 'das Hundertstel', 'das Tausendstel'] }],
    exceptions: ['die Hälfte'],
  },
  {
    id: 'n-venues', group: 'neuter', number: '3.12', title: 'Hotels, cafés, cinemas, theatres',
    sections: [{ examples: ['das Carlton', 'das Kranzler', 'das Apollo', 'das Flora', 'das Hilton', 'das Sacher', 'das Atlantic'] }],
  },
  {
    id: 'n-endings', group: 'neuter', number: '3.13', title: 'Foreign words ending in -at, -o and -ment',
    sections: [
      { label: '-at', examples: ['das Resultat', 'das Konsulat', 'das Internat', 'das Referat', 'das Mandat', 'das Prädikat'] },
      { label: '-o', examples: ['das Büro', 'das Kino', 'das Auto', 'das Konto', 'das Tempo', 'das Foto', 'das Info'] },
      { label: '-ment', examples: ['das Fundament', 'das Parlament', 'das Ornament', 'das Medikament', 'das Element', 'das Regiment', 'das Sortiment', 'das Kompliment', 'das Dokument', 'das Pigment'] },
    ],
    note: 'das Moment (= Umstand, Merkmal, Gesichtspunkt) / der Moment (= Augenblick) – two different words.',
  },

  // ---- Either or ----
  {
    id: 't-rivers', group: 'tricky', number: '4.1', title: 'Feminine or masculine: river names',
    sections: [
      { label: 'Mostly feminine', examples: ['die Elbe', 'die Weichsel', 'die Seine', 'die Isar', 'die Spree', 'die Donau', 'die Moldau', 'die Themse'] },
      { label: 'Masculine', examples: ['der Rhein', 'der Tiber', 'der Mississippi', 'der Neckar', 'der Inn', 'der Amazonas'] },
    ],
    note: 'Most rivers are feminine – the masculine ones have to be learned (many non-German ones ending in a consonant or -i/-s).',
  },
  {
    id: 't-ge', group: 'tricky', number: '5.1', title: 'Neuter or masculine: the prefix Ge-',
    sections: [
      { label: 'Most are neuter', examples: ['das Gebirge', 'das Getreide', 'das Gesetz', 'das Gesicht', 'das Gespräch', 'das Gestein', 'das Getier', 'das Getränk', 'das Gewässer', 'das Gewicht', 'das Gewölk', 'das Getriebe'] },
      { label: 'Some are masculine', examples: ['der Geruch', 'der Gesang', 'der Gedanke', 'der Genuss', 'der Geschmack', 'der Gestank'] },
      { label: 'A few are feminine', examples: ['die Geburt', 'die Geduld', 'die Gefahr', 'die Gewalt'] },
    ],
    note: 'der Gehalt = the content, das Gehalt = the salary.',
  },
  {
    id: 't-nis', group: 'tricky', number: '6.1', title: 'Neuter or feminine: the ending -nis',
    sections: [
      { label: 'Mostly neuter', examples: ['das Ergebnis', 'das Geheimnis', 'das Erlebnis', 'das Gedächtnis', 'das Verhältnis', 'das Bedürfnis', 'das Zeugnis', 'das Verzeichnis', 'das Verständnis', 'das Einverständnis', 'das Verhängnis', 'das Hindernis', 'das Geständnis', 'das Ärgernis', 'das Bündnis', 'das Erzeugnis', 'das Gefängnis', 'das Bekenntnis'] },
      { label: 'Some are feminine', examples: ['die Finsternis', 'die Erlaubnis', 'die Kenntnis', 'die Erkenntnis', 'die Fäulnis', 'die Wildnis', 'die Ersparnis'] },
    ],
  },
  {
    id: 't-teil', group: 'tricky', number: '7.1', title: 'Masculine or neuter: -teil',
    sections: [
      { label: 'der Teil = a part of a whole', examples: ['der Teil', 'der Bruchteil', 'der Erdteil', 'der Landesteil', 'der Stadtteil', 'der Körperteil', 'der Sonderteil', 'der Vorteil', 'der Nachteil', 'der Anteil', 'der Hauptteil', 'der Hauptanteil', 'der Schlussteil'] },
      { label: 'das Teil = spare part / single piece', examples: ['das Teil', 'das Ersatzteil', 'das Einzelteil', 'das Gegenteil', 'das Erbteil'] },
    ],
    note: 'Oberteil, Unterteil, Zwischenteil and Mittelteil are used with both articles (der/das). In everyday speech there are frequent deviations from these rules.',
  },
  {
    id: 't-subst-adj', group: 'tricky', number: '7.2', title: 'Adjectives used as nouns: persons keep natural gender',
    sections: [
      { label: 'Female', examples: ['die Schöne', 'die Kluge', 'die Neue', 'die Reisende', 'die Lesende', 'die Gesuchte', 'die Bestrafte'] },
      { label: 'Male', examples: ['der Schöne', 'der Kluge', 'der Neue', 'der Reisende', 'der Lesende', 'der Gesuchte', 'der Bestrafte'] },
    ],
    note: 'Things and ideas are neuter (das Schönste im Urlaub); persons follow the natural gender (du bist die Schönste).',
  },
];

export const ARTICLE_COLORS = {
  der: { chip: 'border-blue-500/50 bg-blue-500/10 text-blue-200', text: 'text-blue-300', solid: 'bg-blue-600 hover:bg-blue-500' },
  die: { chip: 'border-rose-500/50 bg-rose-500/10 text-rose-200', text: 'text-rose-300', solid: 'bg-rose-600 hover:bg-rose-500' },
  das: { chip: 'border-emerald-500/50 bg-emerald-500/10 text-emerald-200', text: 'text-emerald-300', solid: 'bg-emerald-600 hover:bg-emerald-500' },
} as const;

export type Article = keyof typeof ARTICLE_COLORS;

export function splitExample(example: string): { article: Article; noun: string } {
  const [article, ...rest] = example.split(' ');
  return { article: article as Article, noun: rest.join(' ') };
}

// ---- Declension ----
// Text in [brackets] is the ending that carries the case information.
export type CaseName = 'Nominativ' | 'Genitiv' | 'Dativ' | 'Akkusativ';
export const CASES: CaseName[] = ['Nominativ', 'Genitiv', 'Dativ', 'Akkusativ'];
export const GENDERS = ['maskulin', 'feminin', 'neutral'] as const;

export type DeclensionTable = Record<CaseName, [string, string, string]>;

export const DECLENSION: { id: string; label: string; table: DeclensionTable }[] = [
  {
    id: 'definite',
    label: 'bestimmter Artikel',
    table: {
      Nominativ: ['d[er] jung[e] Mann', 'd[ie] klug[e] Frau', 'd[as] klein[e] Kind'],
      Genitiv: ['d[es] jung[en] Mann[es]', 'd[er] klug[en] Frau', 'd[es] klein[en] Kind[es]'],
      Dativ: ['d[em] jung[en] Mann', 'd[er] klug[en] Frau', 'd[em] klein[en] Kind'],
      Akkusativ: ['d[en] jung[en] Mann', 'd[ie] klug[e] Frau', 'd[as] klein[e] Kind'],
    },
  },
  {
    id: 'indefinite',
    label: 'unbestimmter Artikel',
    table: {
      Nominativ: ['ein jung[er] Mann', 'ein[e] klug[e] Frau', 'ein klein[es] Kind'],
      Genitiv: ['ein[es] jung[en] Mann[es]', 'ein[er] klug[en] Frau', 'ein[es] klein[en] Kind[es]'],
      Dativ: ['ein[em] jung[en] Mann', 'ein[er] klug[en] Frau', 'ein[em] klein[en] Kind'],
      Akkusativ: ['ein[en] jung[en] Mann', 'ein[e] klug[e] Frau', 'ein klein[es] Kind'],
    },
  },
  {
    id: 'zero',
    label: 'Nullartikel',
    table: {
      Nominativ: ['jung[er] Mann', 'klug[e] Frau', 'klein[es] Kind'],
      Genitiv: ['jung[en] Mann[es]', 'klug[er] Frau', 'klein[en] Kind[es]'],
      Dativ: ['jung[em] Mann', 'klug[er] Frau', 'klein[em] Kind'],
      Akkusativ: ['jung[en] Mann', 'klug[e] Frau', 'klein[es] Kind'],
    },
  },
];

export const DEMONSTRATIVE: DeclensionTable = {
  Nominativ: ['dies[er] jung[e] Mann', 'dies[e] klug[e] Frau', 'dies[es] klein[e] Kind'],
  Genitiv: ['dies[es] jung[en] Mann[es]', 'dies[er] klug[en] Frau', 'dies[es] klein[en] Kind[es]'],
  Dativ: ['dies[em] jung[en] Mann', 'dies[er] klug[en] Frau', 'dies[em] klein[en] Kind'],
  Akkusativ: ['dies[en] jung[en] Mann', 'dies[e] klug[e] Frau', 'dies[es] klein[e] Kind'],
};

export const ARTICLE_FORMS: Record<CaseName, [string, string, string]> = {
  Nominativ: ['der', 'die', 'das'],
  Genitiv: ['des (+ -(e)s)', 'der', 'des (+ -(e)s)'],
  Dativ: ['dem', 'der', 'dem'],
  Akkusativ: ['den', 'die', 'das'],
};

export const CONTRACTIONS: [string, string][] = [
  ['an dem', 'am'], ['in dem', 'im'], ['in das', 'ins'], ['von dem', 'vom'], ['zu dem', 'zum'], ['zu der', 'zur'], ['bei dem', 'beim'],
];

export const N_DECLENSION: { id: string; label: string; cells: Record<CaseName, string> }[] = [
  {
    id: 'definite',
    label: 'bestimmter Artikel',
    cells: {
      Nominativ: 'd[er] gut[e] Mensch',
      Genitiv: 'd[es] gut[en] Mensch[en]',
      Dativ: 'd[em] gut[en] Mensch[en]',
      Akkusativ: 'd[en] gut[en] Mensch[en]',
    },
  },
  {
    id: 'indefinite',
    label: 'unbestimmter Artikel',
    cells: {
      Nominativ: 'ein gut[er] Mensch',
      Genitiv: 'ein[es] gut[en] Mensch[en]',
      Dativ: 'ein[em] gut[en] Mensch[en]',
      Akkusativ: 'ein[en] gut[en] Mensch[en]',
    },
  },
];
