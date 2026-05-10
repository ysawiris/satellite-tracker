# Satellite Tracker

Satellite Tracker is a Python library for tracking satellites at any given date and time.

## Installation after Cloning
Create a virtual enviroment
```bash
python3 -m venv env 
```
```bash
source env/bin/activate
```

Use the package manager [pip](https://pip.pypa.io/en/stable/) to install Satellite Tracker dependencies.
```bash
pip install -r requirement.txt
```

Create a file name 'SLTrack.ini' and store your Space Track email and password 
```bash
touch SLTrack.ini
```

```text
[configuration]
username = xxxxxxx@xxxx.xxx
password = xxxxxxxxxxx
```

Create a config.js in static/js/script.js and store your Mapbox access token 
```javascript
const config = {
    MY_KEY : 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
    SECRET_KEY : 'mapbox://styles/chudierp/xxxxxxxxxxxx',
    KEY_2 : 'xxxxx'
}
```

## Usage

Search for all satellites based on the current date and time:

http://127.0.0.1:5000/

![Alt text](screenshots/allsatellites.png?raw=true "All")

Search for Satellites based on date, time and seacrh radius relative to the longitude and latitude:

http://127.0.0.1:5000/lat/37.67,N/lon/122.08,W/date/2020-10-18--2020-10-19/time/2020,10,19,14,43,9/distance/-2000,2000,-2000,2000,000,1000

![Alt text](/screenshots/satellitesbydate.png?raw=true "Search By Date")

## Contributing

Pull requests are welcome. For major changes, please open an issue first to discuss what you would like to change.

Please make sure to update tests as appropriate.

## License

[MIT](https://choosealicense.com/licenses/mit/)