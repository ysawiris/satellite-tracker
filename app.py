#----------------------------------------------------------------------------#
# Imports
#----------------------------------------------------------------------------#
import os
import pymongo
from forms import *
from logging import Formatter, FileHandler
import logging
from spack_track import getTLESatellites
from pytz import timezone
from datetime import datetime, timedelta
from skyfield.api import Topos, load
from flask import Flask, render_template, request, jsonify
import sys
import requests
from requests.exceptions import HTTPError


#----------------------------------------------------------------------------#
# App Config.
#----------------------------------------------------------------------------#

app = Flask(__name__)


myclient = pymongo.MongoClient("mongodb://localhost:27017/")
mydb = myclient["mydatabase"]

mysat = mydb["satellites"]
recentSearch = mydb['recentSearch']


def getFiredata():
    try:
        response = requests.get(
            'https://www.fire.ca.gov/umbraco/api/IncidentApi/List?inactive=true')
        response.raise_for_status()
        # access JSOn content
        jsonResponse = response.json()
        # print("Entire JSON response")
        # print(jsonResponse)
        for index in range(len(jsonResponse)):
            for key in jsonResponse[index]:
                if jsonResponse[index][key] == True:
                    jsonResponse[index][key] = 'True'
                if jsonResponse[index][key] == False:
                    jsonResponse[index][key] = 'False'
                if jsonResponse[index][key] == None:
                    jsonResponse[index][key] = 'None'
        return jsonResponse

    except HTTPError as http_err:
        print(f'HTTP error occurred: {http_err}')
    except Exception as err:
        print(f'Other error occurred: {err}')


def stripText(text):
    chars_to_remove = 'deg\'"'
    new_str = str(text)

    for char in chars_to_remove:
        new_str = new_str.replace(char, '')

    return new_str


def set_dateTime(date):
    # date format 'YYYY-MM-DD--YYYY-MM-DD'
    station_url2 = getTLESatellites(date)

    f = open("demofile4.txt", "w")
    f.write(station_url2)
    f.close()


def get_current_date():
    today = datetime.today().strftime('%Y-%m-%d')
    yesterday = datetime.now() - timedelta(1)

    date1 = "{}{}{}".format(
        str(yesterday.strftime('%Y-%m-%d')), "--", today)

    return date1


def set_Time(time):

    ts = load.timescale()
    t = ts.now().utc_datetime()

    pacific = timezone('US/Pacific')
    # you can also convert to eastern by using eastern = timezone('US/Eastern')

    print('TS NOW: ' + str(t))

    # Converting US Pacific Time to a Julian date.
    # October 1, 2020 5:45:09 PM -> d = datetime(2020, 10, 1, 17, 45, 9)

    d = datetime(int(time[0]), int(time[1]), int(time[2]),
                 int(time[3]), int(time[4]), int(time[5]))
    p = pacific.localize(d)
    t = ts.from_datetime(p)
    print(p)
    return t


def set_observerCordinates(longitude, latitude, alitude=None):
    longitude = longitude.split(',')
    longitude = longitude[0] + longitude[1]
    latitude = latitude.split(',')
    latitude = latitude[0] + latitude[1]
    observer = Topos(str(latitude), str(longitude))
    return observer


def build_satellites(date=None, time=None, observer=None):
    mysat.remove()

    if date == None:
        date = get_current_date()

    print(str(date))

    if time == None:
        ts = load.timescale()
        t = ts.now()
        print(t)
    else:
        t = set_Time(time)

    set_dateTime(str(date))

    satellites = load.tle_file("demofile4.txt", reload=True)

    print('Number of Satellites Loaded', len(satellites))
    for satellite in satellites:
        geometry = satellite.at(t)
        subpoint = geometry.subpoint()

        latitude = subpoint.latitude.degrees
        latitude = stripText(latitude)

        longitude = subpoint.longitude.degrees
        longitude = stripText(longitude)

        elevation = subpoint.elevation
        elevation = stripText(elevation)
        if observer:
            difference = satellite - observer
            topocentric = difference.at(t)
            found_sat = mysat.find_one({'name': satellite.name})
            if found_sat:
                mysat.update(found_sat, {'name': satellite.name, 'sat_num': satellite.model.satnum, 'latitude': str(latitude), 'longitude': str(
                    longitude), 'elevation': str(elevation), 'difference': [topocentric.position.km[0], topocentric.position.km[1], topocentric.position.km[2]]})
            else:
                mysat.insert({'name': satellite.name, 'sat_num': satellite.model.satnum, 'latitude': str(latitude), 'longitude': str(
                    longitude), 'elevation': str(elevation), 'difference': [topocentric.position.km[0], topocentric.position.km[1], topocentric.position.km[2]]})
        else:
            found_sat = mysat.find_one({'name': satellite.name})
            if found_sat:
                mysat.update(found_sat, {'name': satellite.name, 'sat_num': satellite.model.satnum, 'latitude': str(
                    latitude), 'longitude': str(longitude), 'elevation': str(elevation)})
            else:
                mysat.insert({'name': satellite.name, 'sat_num': satellite.model.satnum, 'latitude': str(
                    latitude), 'longitude': str(longitude), 'elevation': str(elevation)})


# Login required decorator.
'''
def login_required(test):
    @wraps(test)
    def wrap(*args, **kwargs):
        if 'logged_in' in session:
            return test(*args, **kwargs)
        else:
            flash('You need to login first.')
            return redirect(url_for('login'))
    return wrap
'''
#----------------------------------------------------------------------------#
# Controllers.
#----------------------------------------------------------------------------#


@app.route('/')
def home():
    build_satellites()
    output = []
    fireOutput = []
    fireData = getFiredata()
    for f in fireData:
        if isinstance(f['Longitude'], float):
            fireOutput.append(f)

    for s in mysat.find():
        output.append({'name': s['name'], 'sat_num': s['sat_num'], 'latitude': s['latitude'],
                       'longitude': s['longitude'], 'elevation': s['elevation']})
    # return jsonify({'result' : output})
    return render_template('pages/satellite-info.html', output=output, fireData=fireOutput)

# http://127.0.0.1:5000/sat_name/STARLINK-1091


@app.route('/sat_name/<name>')
def info(name):
    output = []
    for s in mysat.find():
        if s['name'] == name:
            output.append({'name': s['name'], 'sat_num': s['sat_num'], 'latitude': s['latitude'],
                           'longitude': s['longitude'], 'elevation': s['elevation']})
    return render_template('pages/satellite-info.html', output=output)

# http://127.0.0.1:5000/sat_name/STARLINK-1091/lat/37.67,N/lon/122.08,W


@app.route('/sat_name/<name>/lat/<latitude>/lon/<longitude>')
def observerSatelliteInfo(name, longitude, latitude):
    # /lat/<latitude>/lon/<longitude>/alt/<alitude>
    observer = set_observerCordinates(longitude, latitude)
    lat = stripText(observer.latitude.degrees)
    lon = stripText(observer.longitude.degrees)

    output = []
    obs = []

    obs.append({'latitude': lat, 'longitude': lon})
    print(obs)

    for s in mysat.find():
        if s['name'] == name:
            output.append({'name': s['name'], 'sat_num': s['sat_num'], 'latitude': s['latitude'],
                           'longitude': s['longitude'], 'elevation': s['elevation']})
    return render_template('pages/satellite-observer-info.html', output=output, observer=obs)

# http://127.0.0.1:5000/lat/37.67,N/lon/122.08,W/date/2020-10-18--2020-10-19/time/2020,10,19,14,43,9/distance/-2000,2000,-1000,2000,000,1000


@app.route('/lat/<latitude>/lon/<longitude>/date/<date>/time/<time>/distance/<distance>')
def observerSearchByDateTime(longitude, latitude, date, time, distance):
    # /lat/<latitude>/lon/<longitude>/alt/<alitude>
    observer = set_observerCordinates(longitude, latitude)
    time = time.split(',')
    distance = distance.split(',')

    lat = stripText(observer.latitude.degrees)
    lon = stripText(observer.longitude.degrees)

    output = []
    obs = []

    obs.append({'latitude': lat, 'longitude': lon})
    print(obs)
    build_satellites(date, time, observer)
    for s in mysat.find():
        if int(distance[0]) <= int(s['difference'][0]) <= int(distance[1]) and int(distance[2]) <= int(s['difference'][1]) <= int(distance[3]) and int(distance[4]) <= int(s['difference'][2]) <= int(distance[5]):
            output.append({'name': s['name'], 'sat_num': s['sat_num'], 'latitude': s['latitude'],
                           'longitude': s['longitude'], 'elevation': s['elevation'], 'difference': s['difference']})
    # return jsonify({'result' : output})
    print('Number of Satellites Nearby', len(output))
    return render_template('pages/satellites-observer.html', output=output, observer=obs)


@app.route('/login')
def login():
    form = LoginForm(request.form)
    return render_template('forms/login.html', form=form)


@app.route('/register')
def register():
    form = RegisterForm(request.form)
    return render_template('forms/register.html', form=form)


@app.route('/forgot')
def forgot():
    form = ForgotForm(request.form)
    return render_template('forms/forgot.html', form=form)

# Error handlers.


@app.errorhandler(500)
def internal_error(error):
    return render_template('errors/500.html'), 500


@app.errorhandler(404)
def not_found_error(error):
    return render_template('errors/404.html'), 404


if not app.debug:
    file_handler = FileHandler('error.log')
    file_handler.setFormatter(
        Formatter(
            '%(asctime)s %(levelname)s: %(message)s [in %(pathname)s:%(lineno)d]')
    )
    app.logger.setLevel(logging.INFO)
    file_handler.setLevel(logging.INFO)
    app.logger.addHandler(file_handler)
    app.logger.info('errors')

#----------------------------------------------------------------------------#
# Launch.
#----------------------------------------------------------------------------#

# Default port:
if __name__ == '__main__':
    app.run()

# Or specify port manually:
'''
if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port)
'''
