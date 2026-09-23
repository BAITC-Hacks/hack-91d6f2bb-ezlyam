import type { Initiative } from "../types/simulation";

/** Стоимость в условных единицах датасета; конвертация в валюту не задана.
 * Descriptions and qualitative risks are authored explanations, not extra numeric effects.
 */
export const initiatives: Initiative[] = [
  { id: "M1", title: "Выделенные полосы для автобусов", description: "Выделенные полосы на загруженных маршрутах.", category: "transport", type: "district", cost: 18, lag: 2, effects: { T1: 6, T2: 9 }, risk: "Перераспределение полос может замедлить личный транспорт." },
  { id: "M2", title: "Умные светофоры", description: "Адаптивное управление городскими перекрёстками.", category: "transport", type: "city", cost: 22, lag: 2, effects: { T1: 4, B2: 3 }, risk: "Эффект зависит от качества датчиков и настройки алгоритмов." },
  { id: "M3", title: "Линия ЛРТ и расширение", description: "Развитие скоростного общественного транспорта.", category: "transport", type: "district", cost: 30, lag: 4, effects: { T1: 16, T2: 20, E2: 4 }, risk: "Долгий лаг и строительные ограничения требуют устойчивого финансирования." },
  { id: "M4", title: "Парк или сквер", description: "Создание доступного зелёного пространства в районе.", category: "ecology", type: "district", cost: 15, lag: 2, effects: { E1: 12, E2: 3, B1: 2 }, risk: "Парку потребуется постоянное содержание." },
  { id: "M5", title: "Чистое топливо для частного сектора", description: "Перевод частного сектора на более чистое топливо.", category: "ecology", type: "district", cost: 25, lag: 3, effects: { E2: 14, C1: 4 }, risk: "Результат зависит от охвата домов и соблюдения программы." },
  { id: "M6", title: "Городское озеленение и ветрозащитные полосы", description: "Городская программа посадок и защиты от ветра.", category: "ecology", type: "city", cost: 20, lag: 4, effects: { E1: 5, E2: 3 }, risk: "Заметный эффект появляется не сразу." },
  { id: "M7", title: "Школа и детсад", description: "Модульное строительство образовательной инфраструктуры.", category: "social", type: "district", cost: 24, lag: 3, effects: { S1: 16 }, risk: "Строительство временно увеличит нагрузку на район." },
  { id: "M8", title: "Центр семейного здоровья", description: "Поликлиника и первичная медицинская помощь.", category: "social", type: "district", cost: 20, lag: 3, effects: { S2: 14 }, risk: "Нужны персонал и устойчивые операционные расходы." },
  { id: "M9", title: "Дворовые спорт-хабы", description: "Доступные спортивные пространства во дворах.", category: "social", type: "district", cost: 10, lag: 1, effects: { S1: 3, S2: 3, B1: 3 }, risk: "Эффект зависит от доступности и регулярного использования." },
  { id: "M10", title: "Освещение и камеры Safe City", description: "Расширение освещения и видеонаблюдения.", category: "safety", type: "district", cost: 12, lag: 1, effects: { B1: 12, B2: 2 }, risk: "Система требует обслуживания и соблюдения правил приватности." },
  { id: "M11", title: "Безопасные переходы и школьные зоны", description: "Островки безопасности и защита пешеходных маршрутов.", category: "safety", type: "district", cost: 10, lag: 1, effects: { B2: 12, T1: -2 }, risk: "На отдельных улицах может вырасти время поездки автомобиля." },
  { id: "M12", title: "Единая цифровая платформа обращений", description: "Единый канал заявок, статусов и обратной связи.", category: "services", type: "city", cost: 14, lag: 1, effects: { C2: 5 }, risk: "Нужно обеспечить доступность сервиса для жителей без смартфона." },
  { id: "M13", title: "Модернизация тепло- и водосетей", description: "Обновление критической коммунальной инфраструктуры.", category: "services", type: "district", cost: 28, lag: 4, effects: { C1: 18, E2: 2 }, risk: "Долгий лаг и высокая стоимость ограничивают другие меры." },
  { id: "M14", title: "Аварийные бригады и раннее оповещение", description: "Быстрое реагирование на аварии ЖКХ.", category: "services", type: "city", cost: 16, lag: 1, effects: { C1: 5, C2: 2 }, risk: "Потребуются постоянные расходы на готовность бригад." },
];
