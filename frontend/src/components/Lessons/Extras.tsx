import React from 'react';
import { useI18n } from '../../i18n';

interface Card { title: string; body: React.ReactNode }

const Ex: React.FC<{ children: React.ReactNode }> = ({ children }) => <span className="text-slate-200 italic">{children}</span>;
const Warn: React.FC<{ children: React.ReactNode }> = ({ children }) => <span className="text-amber-300">{children}</span>;

const CARDS: Card[] = [
  {
    title: 'Time: im / am / in der',
    body: (
      <ul className="space-y-1">
        <li>Seasons & months → <b>im</b>: <Ex>im Frühling, im Sommer, im März, im Dezember</Ex></li>
        <li>Weekdays → <b>am</b>: <Ex>am Montag, am Freitag, am Sonntag</Ex></li>
        <li>Times of day → <b>am</b>: <Ex>am Morgen, am Vormittag, am Mittag, am Abend</Ex></li>
        <li><Warn>But feminine: in der Nacht.</Warn></li>
      </ul>
    ),
  },
  {
    title: 'Compass directions',
    body: (
      <ul className="space-y-1">
        <li>With article: <Ex>der Norden, im Norden, im Süden, im Nordosten</Ex></li>
        <li>Without article after <b>nach</b>: <Ex>nach Norden, nach Osten, nach Süden, nach Westen</Ex></li>
        <li><Ex>Flensburg liegt im Norden Deutschlands, Berchtesgaden im Süden.</Ex></li>
      </ul>
    ),
  },
  {
    title: 'Weather and wind',
    body: (
      <ul className="space-y-1">
        <li><Ex>im Regen, im Schnee, im Hagel, im Tau, im Nebel</Ex></li>
        <li><Ex>im Wind, im Sturm, im Orkan, im Mistral, im Hurrikan, im Schirokko</Ex></li>
        <li><Warn>But: die Brise → in der Brise.</Warn></li>
      </ul>
    ),
  },
  {
    title: 'Numbers and letters',
    body: (
      <ul className="space-y-1">
        <li>Numbers are feminine: <Ex>die Eins, die Zwei, die 24, die 100</Ex></li>
        <li>With indefinite article: <Ex>eine Eins in Mathematik, eine Fünf in Deutsch, eine große 85</Ex></li>
        <li>Letters are neuter: <Ex>das A, das B, das C</Ex> → <Ex>ein A, ein B</Ex></li>
        <li><Ex>Das ist von A bis Z falsch.</Ex></li>
      </ul>
    ),
  },
  {
    title: 'Adjectives & participles as nouns',
    body: (
      <ul className="space-y-1">
        <li>Things and ideas → <b>das</b>: <Ex>das Schöne, das Gute, das Erhoffte, das Gelernte</Ex></li>
        <li>People keep natural gender → <b>der / die</b>: <Ex>der Kluge, die Kluge, die Reisende, der Gesuchte</Ex></li>
        <li><Ex>Das Schönste im Urlaub war das Baden. Du warst wirklich die Schönste.</Ex></li>
        <li><Ex>Alles Lebende muss geschützt werden. Kann er Geschriebenes lesen?</Ex></li>
      </ul>
    ),
  },
  {
    title: 'Verbs as nouns: always das',
    body: (
      <ul className="space-y-1">
        <li><Ex>das Hören, das Sehen, das Gehen, das Lachen, das Weinen, das Spielen</Ex></li>
        <li><Ex>Das Gehen fällt dem Kranken schwer.</Ex></li>
        <li><Ex>Beim Essen führten wir ein interessantes Gespräch. Trotz des langen Wartens …</Ex></li>
        <li>Often as a contraction: <Ex>beim Aufräumen, zum Spazierengehen, vor dem Einschlafen</Ex></li>
      </ul>
    ),
  },
  {
    title: 'der Teil / das Teil',
    body: (
      <ul className="space-y-1">
        <li><b>der Teil</b> = a piece of a whole: <Ex>Den größten Teil des Tages verbringt er am Arbeitsplatz.</Ex></li>
        <li><b>das Teil</b> = a single or spare part: <Ex>Dieses Teil des Motors muss ersetzt werden.</Ex></li>
        <li>Compounds: <Ex>der Vorteil, der Nachteil, der Anteil</Ex> but <Ex>das Ersatzteil, das Einzelteil, das Gegenteil</Ex></li>
        <li>In everyday speech there are many deviations.</li>
      </ul>
    ),
  },
  {
    title: 'Two meanings, two articles',
    body: (
      <ul className="space-y-1">
        <li><b>der Moment</b> = the moment / <b>das Moment</b> = factor, aspect</li>
        <li><b>der Gehalt</b> = content / <b>das Gehalt</b> = salary</li>
        <li><b>der Junge</b> = the boy / <b>das Junge</b> = the young animal</li>
        <li><Ex>Das Militär</Ex> (the armed forces) vs. <Ex>der Militär</Ex> (an officer)</li>
      </ul>
    ),
  },
];

const CARDS_FR: Card[] = [
  {
    title: 'Le temps : im / am / in der',
    body: (
      <ul className="space-y-1">
        <li>Saisons et mois → <b>im</b> : <Ex>im Frühling, im Sommer, im März, im Dezember</Ex></li>
        <li>Jours de la semaine → <b>am</b> : <Ex>am Montag, am Freitag, am Sonntag</Ex></li>
        <li>Moments de la journée → <b>am</b> : <Ex>am Morgen, am Vormittag, am Mittag, am Abend</Ex></li>
        <li><Warn>Mais au féminin : in der Nacht.</Warn></li>
      </ul>
    ),
  },
  {
    title: 'Points cardinaux',
    body: (
      <ul className="space-y-1">
        <li>Avec article : <Ex>der Norden, im Norden, im Süden, im Nordosten</Ex></li>
        <li>Sans article après <b>nach</b> : <Ex>nach Norden, nach Osten, nach Süden, nach Westen</Ex></li>
        <li><Ex>Flensburg liegt im Norden Deutschlands, Berchtesgaden im Süden.</Ex></li>
      </ul>
    ),
  },
  {
    title: 'Météo et vent',
    body: (
      <ul className="space-y-1">
        <li><Ex>im Regen, im Schnee, im Hagel, im Tau, im Nebel</Ex></li>
        <li><Ex>im Wind, im Sturm, im Orkan, im Mistral, im Hurrikan, im Schirokko</Ex></li>
        <li><Warn>Mais : die Brise → in der Brise.</Warn></li>
      </ul>
    ),
  },
  {
    title: 'Chiffres et lettres',
    body: (
      <ul className="space-y-1">
        <li>Les chiffres sont féminins : <Ex>die Eins, die Zwei, die 24, die 100</Ex></li>
        <li>Avec l'article indéfini : <Ex>eine Eins in Mathematik, eine Fünf in Deutsch, eine große 85</Ex></li>
        <li>Les lettres sont neutres : <Ex>das A, das B, das C</Ex> → <Ex>ein A, ein B</Ex></li>
        <li><Ex>Das ist von A bis Z falsch.</Ex></li>
      </ul>
    ),
  },
  {
    title: 'Adjectifs et participes substantivés',
    body: (
      <ul className="space-y-1">
        <li>Choses et idées → <b>das</b> : <Ex>das Schöne, das Gute, das Erhoffte, das Gelernte</Ex></li>
        <li>Les personnes gardent leur genre naturel → <b>der / die</b> : <Ex>der Kluge, die Kluge, die Reisende, der Gesuchte</Ex></li>
        <li><Ex>Das Schönste im Urlaub war das Baden. Du warst wirklich die Schönste.</Ex></li>
        <li><Ex>Alles Lebende muss geschützt werden. Kann er Geschriebenes lesen?</Ex></li>
      </ul>
    ),
  },
  {
    title: 'Verbes substantivés : toujours das',
    body: (
      <ul className="space-y-1">
        <li><Ex>das Hören, das Sehen, das Gehen, das Lachen, das Weinen, das Spielen</Ex></li>
        <li><Ex>Das Gehen fällt dem Kranken schwer.</Ex></li>
        <li><Ex>Beim Essen führten wir ein interessantes Gespräch. Trotz des langen Wartens …</Ex></li>
        <li>Souvent avec une contraction : <Ex>beim Aufräumen, zum Spazierengehen, vor dem Einschlafen</Ex></li>
      </ul>
    ),
  },
  {
    title: 'der Teil / das Teil',
    body: (
      <ul className="space-y-1">
        <li><b>der Teil</b> = une partie d'un tout : <Ex>Den größten Teil des Tages verbringt er am Arbeitsplatz.</Ex></li>
        <li><b>das Teil</b> = une pièce isolée ou de rechange : <Ex>Dieses Teil des Motors muss ersetzt werden.</Ex></li>
        <li>Mots composés : <Ex>der Vorteil, der Nachteil, der Anteil</Ex> mais <Ex>das Ersatzteil, das Einzelteil, das Gegenteil</Ex></li>
        <li>Dans la langue courante, on observe de nombreux écarts.</li>
      </ul>
    ),
  },
  {
    title: 'Deux sens, deux articles',
    body: (
      <ul className="space-y-1">
        <li><b>der Moment</b> = le moment / <b>das Moment</b> = le facteur, l'aspect</li>
        <li><b>der Gehalt</b> = la teneur / <b>das Gehalt</b> = le salaire</li>
        <li><b>der Junge</b> = le garçon / <b>das Junge</b> = le petit (d'un animal)</li>
        <li><Ex>Das Militär</Ex> (l'armée) vs. <Ex>der Militär</Ex> (un officier)</li>
      </ul>
    ),
  },
];

export const Extras: React.FC = () => {
  const { t, language } = useI18n();
  const cards = language === 'fr' ? CARDS_FR : CARDS;
  return (
  <div className="space-y-4">
    {language === 'fr' ? (
      <p className="text-slate-400">Cas particuliers et usages qui accompagnent les règles. Lisez les exemples à voix haute (<i>Lesen Sie laut</i>).</p>
    ) : (
      <p className="text-slate-400">Special cases and usage that go with the rules. Read the examples aloud (<i>Lesen Sie laut</i>).</p>
    )}
    <div className="grid gap-4 md:grid-cols-2" aria-label={t('Special cases')}>
      {cards.map(card => (
        <article key={card.title} className="rounded-xl border border-slate-700 bg-slate-800 p-4">
          <h3 className="mb-2 font-semibold text-blue-300">{card.title}</h3>
          <div className="text-sm text-slate-300">{card.body}</div>
        </article>
      ))}
    </div>
  </div>
  );
};
