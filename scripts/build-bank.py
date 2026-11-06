"""Reproducible authoring tool. Facts are curated; options use same-column peers.
Do not use this tool to fetch or paraphrase third-party question banks.
"""
from pathlib import Path
import json, random, hashlib
ROOT = Path(__file__).resolve().parents[1]
rng = random.Random(20261102)
bank = []

def add(category, topic, text, answer, distractors, explanation, difficulty='medium', cefr=None):
    options = list(dict.fromkeys([str(answer), *map(str, distractors)]))[:4]
    assert len(options) == 4, (text, options)
    rng.shuffle(options)
    q = dict(id=hashlib.sha256((category+'|'+text).encode()).hexdigest()[:20],
             category=category, topic=topic, difficulty=difficulty, text=text,
             options=options, correct=options.index(str(answer)), explanation=explanation)
    if cefr: q['cefr'] = cefr
    bank.append(q)

def facts(filename, category, prompts, levels):
    rows = [line.split('|') for line in (ROOT/'content'/filename).read_text(encoding='utf-8').splitlines() if line and not line.startswith('#')]
    science_prompts = json.loads((ROOT/'content'/'science-prompts.json').read_text(encoding='utf-8')) if filename == 'ciencia.txt' else None
    for row_index, row in enumerate(rows):
        assert len(row) == len(prompts)+1, row
        title, *values = row
        for i, (prompt, answer) in enumerate(zip(prompts, values)):
            candidates = rows
            if filename == 'cine.txt' and i == 2:
                # Other members of these films' casts must never appear as distractors.
                exclusions = {
                  'Vértigo': ['James Stewart'],
                  'Pulp Fiction': ['Harvey Keitel'],
                  'Se7en': ['Brad Pitt'],
                  'Thelma y Louise': ['Harvey Keitel'],
                }.get(title, [])
                candidates = [r for r in rows if r[i+1] not in exclusions]
            if filename == 'cultura.txt' and i == 1:
                # Keep alternative media classes disjoint rather than using overlapping labels.
                group = lambda j: 0 if j < 5 else 1 if j < 15 else 2 if j < 30 else 4 if j < 35 else 5 if j < 43 else 6 if j < 46 else 7
                candidates = [r for j,r in enumerate(rows) if group(j) != group(row_index)]
            if filename == 'deportes.txt':
                overlaps = [{0,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19}, {20,21,22,23,24}, {25,26,27,28}, {29,30}, {31,32,33,34}, {35,36,37,38,39,40,41}, {43,44}, {45,46,47,48}]
                blocked = next((g for g in overlaps if row_index in g), {row_index})
                candidates = [r for j,r in enumerate(rows) if j not in blocked]
            peers = sorted({r[i+1] for r in candidates if r[i+1] != answer})
            distractors = rng.sample(peers, 3)
            if science_prompts and i in (1,3):
                text = science_prompts[row_index][0 if i == 1 else 1]
            else:
                text = prompt.format(t=title)
            add(category, title, text, answer, distractors, f'{title}: {answer}.', levels[i])

facts('historia.txt','Historia',[
    '¿En qué año tuvo lugar este acontecimiento: {t}?',
    '¿Con qué lugar se vincula directamente este acontecimiento: {t}?',
    '¿Qué figura o grupo se asocia con este acontecimiento: {t}?',
    '¿Qué descripción corresponde a este acontecimiento: {t}?'], ['hard','medium','medium','easy'])
facts('geografia.txt','Geografía',[
    '¿Cuál es la capital o sede federal de {t}?', '¿Qué moneda utiliza {t}?',
    'En el modelo de siete continentes, ¿a cuál pertenece la mayor parte de {t}?',
    '¿Cuál de estos lugares se encuentra en {t}?'], ['easy','hard','easy','medium'])
facts('ciencia.txt','Ciencia y naturaleza',[
    '¿Qué estudia o describe {t}?', '¿Qué concepto se relaciona directamente con {t}?',
    '¿Qué ejemplo corresponde a {t}?', '¿Qué afirmación sobre {t} es correcta?'], ['medium','hard','easy','medium'])
facts('arte.txt','Arte y literatura',[
    '¿Quién es el autor o la autora de {t}?', '¿A qué forma artística pertenece {t}?',
    '¿Qué personaje, motivo o rasgo se encuentra en {t}?'], ['medium','easy','hard'])
facts('deportes.txt','Deportes',[
    'En {t}, ¿qué elemento o equipamiento es característico?',
    '¿Qué acción o regla corresponde a {t}?',
    '¿Qué término se utiliza en {t}?'], ['easy','medium','hard'])
facts('cultura.txt','Entretenimiento y cultura general',[
    '¿Qué personaje, objeto o nombre está vinculado con {t}?',
    '¿A qué tipo de creación o actividad corresponde {t}?',
    '¿Qué rasgo distingue a {t}?'], ['easy','medium','hard'])
facts('cine.txt','Cine',[
    '¿Quién dirigió {t}?', '¿En qué año se estrenó originalmente {t}?',
    '¿Qué intérprete forma parte del reparto original (incluidas voces) de {t}?', '¿Qué personaje o elemento argumental pertenece a {t}?'], ['medium','hard','medium','easy'])
facts('filosofia.txt','Filosofía',[
    '¿Qué pensador se asocia con {t}?', '¿Qué idea se relaciona con {t}?',
    '¿Qué ámbito o problema aborda {t}?'], ['medium','hard','easy'])

# Preserve the option order of the original CrossFit and English items.
for _ in range(200):
    rng.shuffle([0, 1, 2, 3])

# CrossFit scenarios concern scoring/notation, not medical advice or changing competition standards.
for n in range(1,11):
    cases=[
      ('AMRAP',f'En un AMRAP, cada ronda tiene {n+4} air squats y 6 sit-ups. Completas 4 rondas y 3 air squats. ¿Cuántas repeticiones sumas?',4*(n+10)+3,[4*(n+10),4*(n+10)+6,5*(n+10)],f'Cuatro rondas de {n+10} repeticiones más 3: {4*(n+10)+3}.','medium'),
      ('EMOM',f'Un EMOM de {n+5} minutos prescribe 4 burpees al inicio de cada minuto. Si completas todo, ¿cuántos burpees haces?',4*(n+5),[n+5,4*(n+4),4*(n+6)],f'{n+5} intervalos × 4 burpees = {4*(n+5)}.','easy'),
      ('Carga',f'Una barra de 20 kg lleva un disco de {n+5} kg a cada lado, sin contar cierres. ¿Cuál es la carga total en kg?',20+2*(n+5),[20+n+5,2*(n+5),40+2*(n+5)],f'20 + 2 × {n+5} = {30+2*n} kg.','easy'),
      ('Rondas',f'Un WOD indica {n+2} rondas de 8 kettlebell swings. ¿Cuántos swings hay en total?',8*(n+2),[8*(n+1),8*(n+3),n+10],f'{n+2} × 8 = {8*(n+2)} swings.','easy'),
      ('Distancia',f'Un WOD contiene {n+2} rondas con 200 m de carrera por ronda. ¿Qué distancia total se corre, en metros?',200*(n+2),[100*(n+2),200*(n+1),400*(n+2)],f'{n+2} × 200 m = {200*(n+2)} m.','easy'),
      ('Intervalos',f'Completas {n+3} intervalos de 40 segundos de trabajo y 20 de descanso, incluido el último descanso. ¿Cuánto dura el bloque en segundos?',60*(n+3),[40*(n+3),60*(n+3)-20,80*(n+3)],f'Cada intervalo dura 60 s; {n+3} × 60 = {60*(n+3)} s.','medium'),
      ('For time',f'En un WOD for time tardas {n+4} minutos y 35 segundos. ¿Cuántos segundos son?',60*(n+4)+35,[60*(n+4)+53,60*(n+4),60*(n+5)+35],f'{n+4} × 60 + 35 = {60*(n+4)+35} s.','medium'),
      ('Volumen',f'En un registro de entrenamiento completas 5 series de 3 repeticiones de peso muerto a {n+30} kg. ¿Qué volumen carga × repeticiones registras en kg?',15*(n+30),[5*(n+30),3*(n+30),8*(n+30)],f'5 × 3 × {n+30} = {15*(n+30)} kg de volumen externo.','hard'),
      ('Escalado',f'Un WOD de práctica propone {10*(n+2)} repeticiones. El entrenador reduce el volumen al 60 %. ¿Cuántas repeticiones quedan?',6*(n+2),[4*(n+2),8*(n+2),10*(n+2)],f'{10*(n+2)} × 0,60 = {6*(n+2)}.','hard'),
      ('Relevos',f'En un WOD por parejas, alternáis tandas de 5 repeticiones sin trabajar a la vez. Cada persona completa {n+2} tandas. ¿Cuántas repeticiones suma la pareja?',10*(n+2),[5*(n+2),10*(n+1),10*(n+3)],f'2 personas × {n+2} tandas × 5 = {10*(n+2)}.','medium')]
    for topic,text,ans,ds,exp,level in cases: add('CrossFit',topic,text,ans,ds,exp,level)

for line in (ROOT/'content'/'crossfit.txt').read_text(encoding='utf-8').splitlines():
    if not line or line.startswith('#'): continue
    topic,text,answer,a,b,c,explanation,level=line.split('|')
    add('CrossFit',topic,text,answer,[a,b,c],explanation,level)

# English items are authored complete sentences, not translations or vocabulary drills.
for line in (ROOT/'content'/'ingles.txt').read_text(encoding='utf-8').splitlines():
    if not line or line.startswith('#'): continue
    level,topic,text,answer,a,b,c,explanation=line.split('|')
    add('Gramática de inglés',topic,text,answer,[a,b,c],explanation,'medium' if level=='B1' else 'hard',level)

def source_rows(filename):
    return [line.split('|') for line in (ROOT/'content'/filename).read_text(encoding='utf-8-sig').splitlines()
            if line.strip() and not line.startswith('#')]

def alternatives(answer, candidates):
    return rng.sample(sorted(set(candidates) - {answer}), 3)

capital_category = 'Capitales de países del mundo'
capitals = source_rows('capitales.txt')
geography_countries = {row[0] for row in source_rows('geografia.txt')}
hard_capitals = {'Benín', 'Costa de Marfil', 'Burundi', 'Palaos', 'Micronesia',
                 'Kiribati', 'Islas Marshall', 'Tuvalu', 'Kazajistán', 'Myanmar',
                 'Timor Oriental', 'Brunéi', 'Comoras', 'Gambia', 'Lesoto',
                 'Malaui', 'Vanuatu', 'Samoa', 'Tonga', 'Surinam', 'Guyana',
                 'San Cristóbal y Nieves', 'Santa Lucía', 'Dominica', 'Granada',
                 'San Vicente y las Granadinas', 'Antigua y Barbuda'}
for region, country, capital in capitals:
    peers = [row for row in capitals if row[0] == region]
    explanation = f'{capital} es la capital de {country}.'
    level = 'hard' if country in hard_capitals else 'medium'
    if country in geography_countries:
        # Geografía already asks these in the country-to-capital direction.
        add(capital_category, region, f'¿De qué país es capital {capital}?', country,
            alternatives(country, [row[1] for row in peers]), explanation, 'easy')
    else:
        text = f'¿Cuál es la capital de {country}?'
        if country == 'Bolivia':
            text = '¿Cuál es la capital constitucional de Bolivia?'
            explanation = 'Sucre es la capital constitucional de Bolivia. La Paz es la sede del Gobierno.'
        add(capital_category, region, text, capital,
            alternatives(capital, [row[2] for row in peers]), explanation, level)

myths = source_rows('mitologia.txt')
myth_pools = [
    'Toro|Águila|Pavo real|Mochuelo|Ciervo|Tortuga|Vacas|Dragones|Cisne|Cierva|Osa|Asno|Cerdos|Carneros|Caballo|León|Lobo|Delfín',
    'Tridente|Yelmo|Lira|Caduceo|Tirso|Red|Hoz|Disco|Túnica|Hilo|Argo|Escudo|Sudario|Casco|Arco|Broches|Estaca de olivo|Anillo',
    'Trigo|Granada|Olivo|Laurel|Mirto|Ciprés|Vid|Higuera|Cebada',
    'Sol|Luna|Amanecer|Ocaso|Firmamento|Noche|Rayo|Trueno',
    'Eleusis|Lemnos|Corinto|Esciros|Ítaca|Ida|Troya|Creta|Sípilo|Pactolo|Eea|Ogigia|Delfos|Olimpia',
    'Cerbero|Pitón|León de Nemea|Sirenas|Esfinge|Pegaso|Quimera|Minotauro|Hidra de Lerna|Jabalí de Erimanto',
]
myth_pools = [pool.split('|') for pool in myth_pools]
people = [row[i] for row in myths for i in (2, 4)] + [row[0] for row in myths]
for figure, *pairs in myths:
    for index, (question, answer) in enumerate(zip(pairs[::2], pairs[1::2])):
        candidates = next((pool for pool in myth_pools if answer in pool), None)
        if candidates is None:
            candidates = people if index < 2 or answer in people else [row[6] for row in myths]
        add('Mitología griega', figure, f'{figure} · {question}', answer,
            alternatives(answer, [value for value in candidates
                                  if {answer, value} != {'Cierva', 'Ciervo'}]), f'{figure}: {answer}.', ['medium','hard','easy','medium'][index])

sport_category = 'Historia de los mundiales de fútbol y Juegos Olímpicos de verano'
world_cups = source_rows('mundiales.txt')
coach_editions = {'1930', '1938', '1954', '1966', '1978', '1986', '1998', '2010'}
for year, *values in world_cups:
    tournament = f'Mundial masculino de fútbol {year}'
    deciding_match = 'encuentro decisivo' if year == '1950' else 'final'
    match_article = 'el' if year == '1950' else 'la'
    prompts = [
        '¿Qué selección fue campeona?',
        '¿Qué selección fue subcampeona?',
        f'¿En qué ciudad se disputó {match_article} {deciding_match}?',
        f'¿Cuál fue el marcador {'del' if year == '1950' else 'de la'} {deciding_match}, con el campeón primero y sin contar los penaltis de desempate?',
        '¿Quién dirigió a la selección campeona?'
    ]
    for index, (question, answer) in enumerate(zip(prompts, values)):
        if index == 4 and year not in coach_editions:
            continue
        peers = [row[index + 1] for row in world_cups]
        if index in (0, 1) and ('Alemania' in answer):
            peers = [team for team in peers if not team.startswith('Alemania')]
        explanation = f'{tournament}: {answer}.'
        if index == 3 and year == '1950':
            explanation = 'Uruguay venció a Brasil por 2-1 en el partido decisivo de la liguilla final.'
        add(sport_category, tournament, f'{tournament} · {question}', answer,
            alternatives(answer, peers), explanation, ['easy','medium','medium','hard','hard'][index])

olympics = source_rows('olimpicos.txt')
medal_teams = ['Estados Unidos','Francia','Gran Bretaña','Alemania','Unión Soviética','Equipo Unificado','China','Japón','Australia']
olympic_extras = {
    '1900': ['Exposición Colonial', 'Exposición Iberoamericana', 'Feria Mundial de Chicago'],
    '1908': ['Wembley', 'Estadio Panatenaico', 'Estadio de Colombes'],
    '1924': ['Versalles', 'Saint-Denis', 'Boulogne-Billancourt'],
    '1956': ['Helsinki', 'Oslo', 'Copenhague'],
    '1964': ['Taekwondo', 'Karate', 'Lucha grecorromana'],
    '1972': ['Un oso', 'Un castor', 'Un tigre'],
    '1984': ['Saltos sincronizados', 'Natación en aguas abiertas', 'Waterpolo femenino'],
    '1992': ['Japón', 'Estados Unidos', 'China Taipéi'],
    '2000': ['Pentatlón moderno', 'Duatlón', 'Biatlón'],
    '2024': ['Támesis', 'Ródano', 'Loira']
}
for year, city, leader, event, question, athlete, extra, answer in olympics:
    edition = f'Juegos Olímpicos de verano {year}'
    add(sport_category, edition, f'{edition} · ¿Cuál fue la ciudad anfitriona principal?', city,
        alternatives(city, [row[1] for row in olympics]), f'{city} fue la sede principal de {year}.', 'easy')
    leader_question = ('¿Qué delegaciones terminaron empatadas con más oros?' if year == '2024'
                       else '¿Qué delegación consiguió más medallas de oro?')
    leader_peers = (['China y Japón', 'Estados Unidos y Australia', 'Francia y Gran Bretaña']
                    if year == '2024' else alternatives(leader, medal_teams))
    add(sport_category, edition, f'{edition} · {leader_question}', leader,
        leader_peers, f'{edition}: {leader}.', 'hard')
    add(sport_category, edition, f'{edition} · {question}', athlete,
        alternatives(athlete, [row[5] for row in olympics]), f'{edition} · {event}: {athlete}.', 'medium')
    if year in olympic_extras:
        add(sport_category, edition, f'{edition} · {extra}', answer,
            olympic_extras[year], f'{edition}: {answer}.', 'hard')

astronomy_category = 'Constelaciones y Astronomía'
constellations = source_rows('constelaciones.txt')
for name, abbreviation, figure in constellations:
    add(astronomy_category, 'Constelaciones',
        f'¿Cuál es la abreviatura oficial de la constelación {name}?', abbreviation,
        alternatives(abbreviation, [row[1] for row in constellations]),
        f'La Unión Astronómica Internacional abrevia {name} como {abbreviation}.', 'hard')
    add(astronomy_category, 'Constelaciones',
        f'¿Qué figura da nombre a la constelación {name}?', figure,
        alternatives(figure, [row[2] for row in constellations]),
        f'{name} representa esta figura: {figure.lower()}.', 'medium')

missions = source_rows('misiones.txt')
for name, year, _, target, milestone in missions:
    for index, question, answer, level in [
        (1, f'¿En qué año se lanzó la misión {name}?', year, 'hard'),
        (3, f'¿Cuál fue el destino o ámbito de observación principal de {name}?', target, 'medium'),
        (4, f'¿Qué hito corresponde a la misión {name}?', milestone, 'medium')
    ]:
        peers = [row[index] for row in missions]
        if index == 3:
            # Keep combinations and their component destinations out of the same question.
            peers = [value for value in peers if value not in answer and answer not in value]
        add(astronomy_category, 'Exploración espacial', question, answer,
            alternatives(answer, peers), f'{name}: {answer}.', level)

for topic, question, answer, a, b, c, explanation, level in source_rows('astronomia.txt'):
    add(astronomy_category, topic, question, answer, [a,b,c], explanation, level)

war_category = 'Historia Bélica'
conflicts = source_rows('belica.txt')
for era, event, year, location, figure, description in conflicts:
    peers = [row for row in conflicts if row[0] == era]
    war_ends = {
        'Guerra del Peloponeso (431–404 a. C.)': '404 a. C.',
        'Segunda guerra púnica': '201 a. C.',
        'Primera Cruzada': '1099',
        'Guerra de los Cien Años': '1453',
        'Guerra de los Treinta Años': '1648',
        'Guerra de los Siete Años (inicio convencional)': '1763',
        'Guerra de Crimea': '1856',
        'Primera Guerra Mundial': '1918',
    }
    end = war_ends.get(event)
    label = event.split(' (431')[0]
    year_question = (f'{label} · ¿En qué año comenzó?' if end
                     else f'{label} · ¿En qué año tuvo lugar?')
    add(war_category, era, year_question, year,
        alternatives(year, [row[2] for row in peers]), f'{event}: {year}.', 'hard')
    if end:
        other_ends = [value for value in war_ends.values() if ('a. C.' in value) == ('a. C.' in end)]
        year_peers = other_ends + [row[2] for row in peers if ('a. C.' in row[2]) == ('a. C.' in end)]
        end_question = ('¿En qué año se firmó el armisticio de Compiègne?' if event == 'Primera Guerra Mundial'
                        else '¿En qué año terminó el conflicto?')
        add(war_category, era, f'{label} · {end_question}', end,
            alternatives(end, year_peers), f'{label}: {end}.', 'medium')
    else:
        add(war_category, era, f'{label} · ¿En qué lugar tuvo lugar?', location,
            alternatives(location, [row[3] for row in peers if row[1] not in war_ends]),
            f'{label}: {location}.', 'medium')
    for index, question, answer, level in [
        (4, '¿Qué figura o fuerza participó directamente en este acontecimiento?', figure, 'medium'),
        (5, '¿Qué descripción corresponde a este acontecimiento?', description, 'easy')
    ]:
        # The same person may have fought in other battles of the same era.
        # Ask about a particular side or use a distinct role instead of a second valid participant.
        options = [row[index] for row in peers]
        if index == 4:
            exclusions = {
                'Batalla de Maratón': ['Temístocles'],
                'Batalla de Gaugamela': ['Darío III'],
                'Batalla del Hidaspes': ['Alejandro Magno'],
                'Batalla de Zama': ['Aníbal Barca'],
                'Batalla de Cannas': ['Escipión el Africano'],
                'Segunda guerra púnica': ['Aníbal Barca', 'Escipión el Africano'],
                'Batalla de las Termópilas': ['Temístocles', 'Pausanias de Esparta'],
                'Batalla de Waterloo': ['Napoleón Bonaparte'],
                'Guerra de los Cien Años': ['Enrique V de Inglaterra'],
                'Batalla de Agincourt': ['Corona inglesa'],
                'Guerra de los Treinta Años': ['Conde de Tilly'],
            }
            options = [value for value in options if value not in exclusions.get(event, [])]
        add(war_category, era, f'{label} · {question}', answer,
            alternatives(answer, options), f'{event}: {answer}.', level)

(ROOT/'questions.json').write_text(json.dumps(bank,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(f'{len(bank)} preguntas generadas')
