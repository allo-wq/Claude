"""Content for the "Your Cart vs Your Body" short.

Numbers are approximate values for typical US products, per package for junk
food and per serving for whole foods. A stat is flagged lethal when one package
holds more than half a day's limit (2,300 mg sodium, 50 g added sugar,
2,000 kcal) or 5+ additives.
"""

JUNK = [
    dict(name='CHEESE PUFFS', portion='8.5 oz bag',
         tags=['HIGH BLOOD PRESSURE', 'HEART DISEASE', 'OBESITY'],
         stats=[('SODIUM', '2,130', 'mg', True), ('SUGAR', '8', 'g', False),
                ('CHEMICALS', '8', 'additives', True), ('CALORIES', '1,360', 'kcal', True)],
         price=5.49),
    dict(name='COLA', portion='20 oz bottle',
         tags=['TYPE 2 DIABETES', 'FATTY LIVER', 'TOOTH DECAY'],
         stats=[('SODIUM', '75', 'mg', False), ('SUGAR', '65', 'g', True),
                ('CHEMICALS', '4', 'additives', False), ('CALORIES', '240', 'kcal', False)],
         price=2.49),
    dict(name='GLAZED DONUTS', portion='box of 6',
         tags=['TYPE 2 DIABETES', 'OBESITY', 'INFLAMMATION'],
         stats=[('SODIUM', '540', 'mg', False), ('SUGAR', '60', 'g', True),
                ('CHEMICALS', '7', 'additives', True), ('CALORIES', '1,140', 'kcal', True)],
         price=6.99),
    dict(name='INSTANT RAMEN', portion='1 pack',
         tags=['HIGH BLOOD PRESSURE', 'STROKE', 'KIDNEY DISEASE'],
         stats=[('SODIUM', '1,660', 'mg', True), ('SUGAR', '2', 'g', False),
                ('CHEMICALS', '5', 'additives', True), ('CALORIES', '380', 'kcal', False)],
         price=0.49),
    dict(name='FROZEN PIZZA', portion='whole pepperoni pizza',
         tags=['HEART DISEASE', 'COLON CANCER', 'OBESITY'],
         stats=[('SODIUM', '3,400', 'mg', True), ('SUGAR', '18', 'g', False),
                ('CHEMICALS', '9', 'additives', True), ('CALORIES', '1,600', 'kcal', True)],
         price=6.99),
    dict(name='CANDY BAR', portion='king size',
         tags=['TYPE 2 DIABETES', 'TOOTH DECAY', 'WEIGHT GAIN'],
         stats=[('SODIUM', '220', 'mg', False), ('SUGAR', '44', 'g', True),
                ('CHEMICALS', '4', 'additives', False), ('CALORIES', '440', 'kcal', False)],
         price=2.79),
    dict(name='ENERGY DRINK', portion='16 oz can',
         tags=['HEART RHYTHM ISSUES', 'HIGH BLOOD PRESSURE', 'TYPE 2 DIABETES'],
         stats=[('SODIUM', '370', 'mg', False), ('SUGAR', '54', 'g', True),
                ('CHEMICALS', '7', 'additives', True), ('CALORIES', '210', 'kcal', False)],
         price=3.49),
    dict(name='HOT DOGS', portion='pack of 8',
         tags=['COLON CANCER', 'HEART DISEASE', 'TYPE 2 DIABETES'],
         stats=[('SODIUM', '3,840', 'mg', True), ('SUGAR', '8', 'g', False),
                ('CHEMICALS', '6', 'additives', True), ('CALORIES', '1,200', 'kcal', True)],
         price=4.99),
    dict(name='ICE CREAM', portion='1 pint',
         tags=['OBESITY', 'TYPE 2 DIABETES', 'HEART DISEASE'],
         stats=[('SODIUM', '260', 'mg', False), ('SUGAR', '84', 'g', True),
                ('CHEMICALS', '4', 'additives', False), ('CALORIES', '1,000', 'kcal', True)],
         price=5.99),
    dict(name='TOASTER PASTRIES', portion='1 pack (2 pastries)',
         tags=['TYPE 2 DIABETES', 'INFLAMMATION', 'WEIGHT GAIN'],
         stats=[('SODIUM', '330', 'mg', False), ('SUGAR', '30', 'g', True),
                ('CHEMICALS', '6', 'additives', True), ('CALORIES', '380', 'kcal', False)],
         price=3.99),
]

HEALTHY = [
    dict(name='BROCCOLI', portion='1 cup', tags=['FIBER', 'VITAMIN C & K', 'GUT HEALTH'],
         stats=[('SODIUM', '30', 'mg'), ('SUGAR', '1.5', 'g natural'),
                ('CHEMICALS', '0', 'additives'), ('CALORIES', '31', 'kcal')],
         price=1.99, unit='/head'),
    dict(name='APPLES', portion='1 medium apple', tags=['FIBER', 'ANTIOXIDANTS', 'HEART HEALTH'],
         stats=[('SODIUM', '2', 'mg'), ('SUGAR', '19', 'g natural'),
                ('CHEMICALS', '0', 'additives'), ('CALORIES', '95', 'kcal')],
         price=1.49, unit='/lb'),
    dict(name='BANANAS', portion='1 banana', tags=['POTASSIUM', 'HEALTHY BLOOD PRESSURE', 'QUICK ENERGY'],
         stats=[('SODIUM', '1', 'mg'), ('SUGAR', '14', 'g natural'),
                ('CHEMICALS', '0', 'additives'), ('CALORIES', '105', 'kcal')],
         price=0.69, unit='/lb'),
    dict(name='SPINACH', portion='3 cups', tags=['IRON', 'FOLATE', 'EYE HEALTH'],
         stats=[('SODIUM', '65', 'mg'), ('SUGAR', '0', 'g'),
                ('CHEMICALS', '0', 'additives'), ('CALORIES', '20', 'kcal')],
         price=2.99, unit='/bag'),
    dict(name='SALMON', portion='4 oz fillet', tags=['OMEGA-3s', 'HEART & BRAIN', 'PROTEIN'],
         stats=[('SODIUM', '70', 'mg'), ('SUGAR', '0', 'g'),
                ('CHEMICALS', '0', 'additives'), ('CALORIES', '235', 'kcal')],
         price=9.99, unit='/lb'),
    dict(name='EGGS', portion='2 large eggs', tags=['PROTEIN', 'CHOLINE', 'VITAMIN D'],
         stats=[('SODIUM', '140', 'mg'), ('SUGAR', '0', 'g'),
                ('CHEMICALS', '0', 'additives'), ('CALORIES', '140', 'kcal')],
         price=3.49, unit='/dozen'),
    dict(name='ROLLED OATS', portion='1/2 cup dry', tags=['BETA-GLUCAN FIBER', 'LOWERS LDL', 'STEADY ENERGY'],
         stats=[('SODIUM', '0', 'mg'), ('SUGAR', '1', 'g'),
                ('CHEMICALS', '0', 'additives'), ('CALORIES', '150', 'kcal')],
         price=3.99, unit='/canister'),
    dict(name='BLUEBERRIES', portion='1 cup', tags=['ANTIOXIDANTS', 'BRAIN HEALTH', 'VITAMIN C'],
         stats=[('SODIUM', '1', 'mg'), ('SUGAR', '15', 'g natural'),
                ('CHEMICALS', '0', 'additives'), ('CALORIES', '85', 'kcal')],
         price=3.99, unit='/pint'),
    dict(name='SWEET POTATOES', portion='1 medium', tags=['VITAMIN A', 'FIBER', 'STEADY ENERGY'],
         stats=[('SODIUM', '40', 'mg'), ('SUGAR', '7', 'g natural'),
                ('CHEMICALS', '0', 'additives'), ('CALORIES', '105', 'kcal')],
         price=1.29, unit='/lb'),
    dict(name='AVOCADOS', portion='1/2 avocado', tags=['HEALTHY FATS', 'POTASSIUM', 'HEART HEALTH'],
         stats=[('SODIUM', '5', 'mg'), ('SUGAR', '0.5', 'g'),
                ('CHEMICALS', '0', 'additives'), ('CALORIES', '120', 'kcal')],
         price=1.25, unit='/each'),
]

# The "worst one" breakdown: (label, value, unit, % of daily limit text, lethal)
WORST = dict(
    name='CHEESE PUFFS',
    why='MOST CALORIES · ZERO NUTRITION',
    rows=[('SODIUM', '2,130', 'mg', '93% OF YOUR DAILY LIMIT', True),
          ('SUGAR', '8', 'g', '16% OF YOUR DAILY LIMIT', False),
          ('CHEMICALS', '8', 'additives', 'COLORS · MSG · FLAVORINGS', True),
          ('CALORIES', '1,360', 'kcal', '68% OF YOUR WHOLE DAY', True)],
    fat='85 g OF FAT', oil='≈ 6 TBSP OF OIL',
)

# (stage title, headline, detail, asset, tunnel camera)
JUNK_STAGES = [
    ('THROAT', 'GREASY, SALTY MUSH', 'fatty food can trigger acid reflux', 'j_throat', True),
    ('STOMACH', 'FAT SLOWS DIGESTION', 'bloating · heartburn · sluggish', 'j_stomach', False),
    ('INTESTINES', 'SUGAR & SALT FLOOD IN', 'blood sugar spikes, then crashes', 'j_intestine', False),
    ('BLOODSTREAM', 'PRESSURE RISES', 'sodium + LDL build plaque in arteries', 'j_artery', True),
]
JUNK_OUTCOME = dict(asset='c_xray', items=['OBESITY', 'TYPE 2 DIABETES', 'HEART DISEASE', 'FATTY LIVER'],
                    note='risk climbs when junk food is a daily habit')

HEALTHY_STAGES = [
    ('THROAT', 'SMOOTH & EASY', 'fiber + water keep things moving', 'h_throat', True),
    ('STOMACH', 'FULL FOR LONGER', 'fiber & protein digest slowly', 'h_stomach', False),
    ('INTESTINES', 'NUTRIENTS ABSORBED', 'vitamins & minerals through the villi', 'h_intestine', False),
    ('BLOODSTREAM', 'CLEAN FLOW', 'potassium & omega-3s support your heart', 'h_artery', True),
]
HEALTHY_OUTCOME = dict(asset='c_xray', items=['STRONGER HEART', 'HEALTHY GUT', 'STEADY ENERGY', 'LOWER DISEASE RISK'],
                       note='when real food is a daily habit')

# Positions in the generated stills; render.py overrides these from layout.json
# when present. Boxes are normalized (x0, y0, x1, y1): top row left->right, then
# bottom row, in the same order as JUNK / HEALTHY.
LAYOUT = dict(
    # Measured on the generated junk shelf (shelf_junk.png).
    junk_boxes=[(0.015, 0.13, 0.175, 0.48), (0.17, 0.085, 0.255, 0.485), (0.24, 0.33, 0.415, 0.485),
                (0.405, 0.28, 0.575, 0.485), (0.57, 0.165, 0.805, 0.485),
                (0.0, 0.69, 0.155, 0.965), (0.17, 0.645, 0.245, 0.965), (0.235, 0.645, 0.395, 0.97),
                (0.38, 0.70, 0.535, 0.97), (0.545, 0.785, 0.785, 0.97)],
    # Measured on the generated healthy shelf (shelf_healthy.png).
    healthy_boxes=[(0.0, 0.12, 0.155, 0.44), (0.135, 0.18, 0.31, 0.44), (0.31, 0.11, 0.475, 0.44),
                   (0.47, 0.18, 0.635, 0.44), (0.625, 0.29, 0.84, 0.44),
                   (0.0, 0.70, 0.175, 0.965), (0.175, 0.59, 0.315, 0.97), (0.305, 0.74, 0.465, 0.97),
                   (0.455, 0.67, 0.62, 0.97), (0.615, 0.70, 0.845, 0.97)],
    # Measured on the generated x-ray shot (c_xray.png).
    xray_throat=(0.5, 0.33),
    xray_heart=(0.535, 0.575),
    xray_chest=(0.5, 0.6),
    bag_mouth=(0.5, 0.42),
)
