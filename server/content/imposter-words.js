'use strict';
// Imposter word bank. Everyone except the imposter gets one word; the imposter only sees the category.
// Good words are specific enough to clue, but share a category with plenty of look-alikes.
module.exports = {
  Food: ['Pizza', 'Sushi', 'Spaghetti', 'Curry', 'Burger', 'Pancakes', 'Sausage roll', 'Fish and chips', 'Trifle', 'Crumpet', 'Scotch egg', 'Lasagne', 'Kebab', 'Toast', 'Porridge', 'Doughnut', 'Cheesecake', 'Roast dinner'],
  Animals: ['Penguin', 'Giraffe', 'Hedgehog', 'Shark', 'Kangaroo', 'Owl', 'Octopus', 'Badger', 'Flamingo', 'Squirrel', 'Crocodile', 'Panda', 'Seagull', 'Camel', 'Bee', 'Snail', 'Dolphin', 'Llama'],
  'Places in the UK': ['Blackpool', 'London', 'Edinburgh', 'Stonehenge', 'Liverpool', 'Cornwall', 'Loch Ness', 'Brighton', 'Manchester', 'Cardiff', 'Snowdon', 'Lake District', 'Belfast', 'Oxford', 'Bath', 'Birmingham', 'Margate', 'Isle of Wight'],
  'Places in the world': ['Paris', 'New York', 'Egypt', 'Australia', 'Venice', 'Tokyo', 'Dubai', 'Iceland', 'Las Vegas', 'Rome', 'Jamaica', 'Amsterdam', 'Mount Everest', 'The Amazon', 'Hawaii', 'Barcelona', 'The North Pole', 'The Moon'],
  Jobs: ['Teacher', 'Firefighter', 'Dentist', 'Chef', 'Pilot', 'Plumber', 'Footballer', 'Hairdresser', 'Police officer', 'Nurse', 'Astronaut', 'Postman', 'Farmer', 'Lifeguard', 'Magician', 'Bin man', 'Vet', 'DJ'],
  Sports: ['Football', 'Tennis', 'Golf', 'Swimming', 'Boxing', 'Darts', 'Snooker', 'Cricket', 'Rugby', 'Skiing', 'Basketball', 'Bowling', 'Horse racing', 'Surfing', 'Netball', 'Formula One', 'Ice skating', 'Table tennis'],
  'Things at home': ['Toaster', 'Sofa', 'Fridge', 'Kettle', 'Hoover', 'Bed', 'Mirror', 'Remote control', 'Washing machine', 'Toilet', 'Lamp', 'Bath', 'Microwave', 'Doorbell', 'Wardrobe', 'Radiator', 'Plant pot', 'Iron'],
  Transport: ['Bus', 'Bicycle', 'Helicopter', 'Train', 'Scooter', 'Submarine', 'Taxi', 'Tractor', 'Cruise ship', 'Hot air balloon', 'Skateboard', 'Ambulance', 'Rocket', 'Canoe', 'Tram', 'Motorbike', 'Ice cream van', 'Aeroplane'],
  'At school': ['Pencil', 'Homework', 'Playground', 'Assembly', 'Detention', 'School dinner', 'Whiteboard', 'Calculator', 'PE kit', 'Library', 'Register', 'Lunchbox', 'Sports day', 'Spelling test', 'Head teacher', 'School bus', 'Ruler', 'Exam'],
  'On holiday': ['Suitcase', 'Sun cream', 'Passport', 'Swimming pool', 'Sandcastle', 'Hotel', 'Airport', 'Flip-flops', 'Postcard', 'Sunburn', 'Beach towel', 'Ice cream', 'Tent', 'Theme park', 'Snorkel', 'Duty free', 'Caravan', 'Buffet'],
  'Down the pub': ['Pint', 'Pub quiz', 'Darts board', 'Crisps', 'Jukebox', 'Pork scratchings', 'Fruit machine', 'Barman', 'Last orders', 'Beer garden', 'Sunday roast', 'Karaoke', 'Pool table', 'Bouncer', 'Shandy', 'Peanuts', 'Big screen', 'Round'],
  Christmas: ['Santa', 'Reindeer', 'Christmas tree', 'Cracker', 'Snowman', 'Turkey', 'Stocking', 'Mince pie', 'Elf', 'Sprouts', 'Advent calendar', 'Tinsel', 'Pantomime', 'Mistletoe', 'Carol singers', 'Wrapping paper', 'Nativity', 'Boxing Day'],
  'Films & TV': ['Harry Potter', 'Star Wars', 'Frozen', 'Shrek', 'Toy Story', 'James Bond', 'Love Island', 'EastEnders', 'Doctor Who', 'Jurassic Park', 'Mr Bean', 'Bake Off', 'The Lion King', 'Titanic', 'Peppa Pig', 'Home Alone', 'Batman', 'Gavin & Stacey'],
  'Clothes': ['Wellies', 'Onesie', 'Tracksuit', 'Bobble hat', 'Flip-flops', 'Pyjamas', 'Tie', 'Raincoat', 'Crown', 'Kilt', 'Scarf', 'Sunglasses', 'Socks', 'Wedding dress', 'Football shirt', 'Dressing gown', 'Gloves', 'Swimsuit'],
  'Fruit & veg': ['Banana', 'Carrot', 'Pineapple', 'Potato', 'Strawberry', 'Broccoli', 'Watermelon', 'Onion', 'Lemon', 'Coconut', 'Mushroom', 'Avocado', 'Grapes', 'Sweetcorn', 'Cucumber', 'Pumpkin', 'Cherry', 'Peas'],
  'Famous Brits': ['The King', 'David Beckham', 'Adele', 'Mr Bean', 'Ed Sheeran', 'Gordon Ramsay', 'David Attenborough', 'Harry Styles', 'Lewis Hamilton', 'Winston Churchill', 'Paddington', 'Sherlock Holmes', 'Wallace and Gromit', 'The Spice Girls', 'Mary Berry', 'Stormzy', 'The Beatles', 'Peppa Pig'],
};
